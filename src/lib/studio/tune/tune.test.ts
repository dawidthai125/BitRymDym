import { describe, expect, it } from "vitest";

import { lufsOf } from "@/lib/studio/master/dsp";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  addStudioFxToChain,
  emptyStudioFxChain,
  parseStudioFxChainForWrite,
  type StudioFxChainV1,
} from "@/lib/studio/studio-fx-chain";
import { buildStudioOfflineFxChain } from "@/lib/studio/studio-offline-fx";

import { detectKeyFromAudio } from "./key-detect";
import {
  clampTuneChainForTier,
  compensateStudioTuneLatency,
  findLockedTuneEffect,
  formatTuneKey,
  parseBeatKey,
  TUNE_LATENCY_MS,
  TUNE_STYLES,
  tuneParams,
  tuneStyleOf,
} from "./tune";
import { TuneCore, type TuneCoreParams } from "./tune-core";
import { buildTuneWorkletSource } from "./tune-worklet";

const SR = 44100;
const A_MINOR: TuneCoreParams = { keyRoot: 9, scale: 1, retuneMs: 0, amount: 1 };

/** Voice-like harmonic tone (formant bump ~700 Hz), optional vibrato (semitones). */
function voice(f0: number | ((t: number) => number), secs: number, vib = 0): Float32Array {
  const n = Math.round(SR * secs);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const base = typeof f0 === "number" ? f0 : f0(i / SR);
    const f = base * Math.pow(2, (vib * Math.sin((2 * Math.PI * 5 * i) / SR)) / 12);
    ph += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let h = 1; h <= 14; h += 1) {
      v += (Math.sin(h * ph) / h) * Math.exp(-((h * f - 700) ** 2) / (2 * 600 ** 2));
    }
    x[i] = 0.3 * v;
  }
  return x;
}

/** Fundamental via normalised autocorrelation (first strong peak) + parabola. */
function pitchHz(x: Float32Array, a: number, b: number): number {
  const corr = (lag: number) => {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = a; i < b; i += 1) {
      s += x[i]! * x[i + lag]!;
      e1 += x[i]! * x[i]!;
      e2 += x[i + lag]! * x[i + lag]!;
    }
    return s / Math.sqrt(e1 * e2 + 1e-12);
  };
  const cs = Array.from({ length: 700 }, (_, lag) => (lag < 30 ? 0 : corr(lag)));
  let bi = 0;
  for (let lag = 31; lag < 699; lag += 1) {
    if (cs[lag]! > 0.9 && cs[lag]! >= cs[lag - 1]! && cs[lag]! >= cs[lag + 1]!) {
      bi = lag;
      break;
    }
  }
  const y0 = cs[bi - 1]!;
  const y1 = cs[bi]!;
  const y2 = cs[bi + 1]!;
  return SR / (bi + (y0 - y2) / (2 * (y0 - 2 * y1 + y2)));
}

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

function runCore(x: Float32Array, params: TuneCoreParams, block = x.length, Core: typeof TuneCore = TuneCore) {
  const core = new Core(SR, 2, params);
  const l = new Float32Array(x.length);
  const r = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += block) {
    const m = Math.min(block, x.length - i);
    core.processBlock(x.subarray(i, i + m), x.subarray(i, i + m), l.subarray(i, i + m), r.subarray(i, i + m), m);
  }
  return { l, r, latency: core.latency };
}

function tuneChain(params: Partial<TuneCoreParams>): StudioFxChainV1 {
  const chain = addStudioFxToChain(emptyStudioFxChain(), "tune", "track", () => "11111111-1111-4111-8111-111111111111");
  const effect = chain.effects[0]!;
  return { ...chain, effects: [{ ...effect, params: { ...effect.params, ...params } } as typeof effect] };
}

describe("TuneCore — pitch correction", () => {
  it.each([
    [225, 220],
    [214, 220],
    [440 * Math.pow(2, 0.3 / 12), 440],
    [112.2, 110],
    [256, 261.63], // between B and C (both in A minor) → C is nearer
  ])("hard style snaps %f Hz to %f Hz in A minor (±3 ct)", (fin, fout) => {
    const x = voice(fin, 1.6);
    const { l } = runCore(x, A_MINOR);
    expect(Math.abs(cents(pitchHz(l, 50000, 52000), fout))).toBeLessThan(3);
  });

  it("chromatic scale snaps to the nearest semitone", () => {
    const x = voice(233.08 * Math.pow(2, 0.35 / 12), 1.4); // A#3 +35 ct
    const { l } = runCore(x, { keyRoot: 0, scale: 2, retuneMs: 0, amount: 1 });
    expect(Math.abs(cents(pitchHz(l, 45000, 47000), 233.08))).toBeLessThan(3);
  });

  it("natural style corrects ~85 % (leaves a little of the original)", () => {
    const x = voice(225, 1.6);
    const { l } = runCore(x, { keyRoot: 9, scale: 1, ...TUNE_STYLES.natural });
    const rest = cents(pitchHz(l, 55000, 57000), 220);
    const err = cents(225, 220);
    expect(rest).toBeGreaterThan(err * 0.15 - 2);
    expect(rest).toBeLessThan(err * 0.15 + 2);
  });

  it("retune speed: hard reaches the note within 25 ms, natural takes longer", () => {
    // 0.5 s at 225 Hz (A minor → 220), measured right after the voiced onset.
    const x = voice(225, 1);
    const onsetWindow = (p: TuneCoreParams) => {
      const { l, latency } = runCore(x, p);
      return Math.abs(cents(pitchHz(l, latency + 3000, latency + 4200), 220));
    };
    const hard = onsetWindow(A_MINOR);
    const natural = onsetWindow({ ...A_MINOR, ...TUNE_STYLES.natural, amount: 1 });
    expect(hard).toBeLessThan(4);
    expect(natural).toBeGreaterThan(hard + 5);
  });

  it("amount 0 is bit-transparent apart from the fixed latency", () => {
    const x = voice(225, 1, 0.4);
    const { l, latency } = runCore(x, { ...A_MINOR, amount: 0 });
    expect(latency).toBe(Math.round((SR * TUNE_LATENCY_MS) / 1000));
    let maxErr = 0;
    for (let i = 0; i < x.length - latency; i += 1) maxErr = Math.max(maxErr, Math.abs(l[i + latency]! - x[i]!));
    expect(maxErr).toBeLessThan(1e-5);
  });

  it("silence in → silence out; output is finite on noise", () => {
    const silent = runCore(new Float32Array(SR), A_MINOR);
    expect(silent.l.every((v) => v === 0)).toBe(true);
    let seed = 7;
    const noise = Float32Array.from({ length: SR }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648 - 0.5) * 0.5;
    });
    const out = runCore(noise, A_MINOR);
    expect(out.l.every(Number.isFinite)).toBe(true);
  });

  it("is chunk-size invariant (128-frame worklet blocks == one block)", () => {
    const x = voice((t) => 200 * Math.pow(2, t / 2), 1.2, 0.3);
    const whole = runCore(x, { ...A_MINOR, retuneMs: 40 });
    const blocks = runCore(x, { ...A_MINOR, retuneMs: 40 }, 128);
    const odd = runCore(x, { ...A_MINOR, retuneMs: 40 }, 77);
    expect(blocks.l).toEqual(whole.l);
    expect(odd.r).toEqual(whole.r);
  });

  it("source is self-contained (AudioWorklet copy behaves identically)", () => {
    const Copy = new Function(`return (${TuneCore.toString()});`)() as typeof TuneCore;
    const x = voice(214, 0.8, 0.2);
    expect(runCore(x, A_MINOR, 128, Copy).l).toEqual(runCore(x, A_MINOR).l);
    const src = buildTuneWorkletSource();
    expect(src).toContain('registerProcessor("brd-tune"');
    expect(src).not.toMatch(/\brequire\(|\bimport\s/);
  });
});

describe("BRD Tune — preview (worklet) ↔ E3 render parity", () => {
  it("offline chain == worklet stream shifted by latency: ≤ 0.5 LU, r > 0.999", () => {
    // Glide + vibrato "vocal" with a breath gap, stereo-ish (R slightly quieter).
    const secs = 3;
    const x = voice((t) => 190 * Math.pow(2, (t * 3) / 12), secs, 0.35);
    for (let i = Math.round(SR * 1.4); i < Math.round(SR * 1.6); i += 1) x[i] = 0;
    const chain = tuneChain({ keyRoot: 9, scale: 1, retuneMs: 20, amount: 1 });
    const offline = buildStudioOfflineFxChain(chain, "track", SR)!;
    const left = x.slice();
    const right = x.map((v) => v * 0.8);
    offline.processBuffer(left, right);

    // Browser path: the worklet module's class, 128-frame blocks.
    const Worklet = new Function(`return (${TuneCore.toString()});`)() as typeof TuneCore;
    const live = new Worklet(SR, 2, { keyRoot: 9, scale: 1, retuneMs: 20, amount: 1 });
    const n = x.length + live.latency;
    const inL = new Float32Array(n);
    const inR = new Float32Array(n);
    inL.set(x);
    inR.set(x.map((v) => v * 0.8));
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);
    for (let i = 0; i < n; i += 128) {
      const m = Math.min(128, n - i);
      live.processBlock(inL.subarray(i, i + m), inR.subarray(i, i + m), outL.subarray(i, i + m), outR.subarray(i, i + m), m);
    }
    const aligned = { left: outL.slice(live.latency), right: outR.slice(live.latency), sampleRate: SR };
    const lu = Math.abs(lufsOf({ left, right, sampleRate: SR }) - lufsOf(aligned));
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < x.length; i += 1) {
      s += left[i]! * aligned.left[i]!;
      e1 += left[i]! ** 2;
      e2 += aligned.left[i]! ** 2;
    }
    expect(lu).toBeLessThanOrEqual(0.5);
    expect(s / Math.sqrt(e1 * e2)).toBeGreaterThan(0.999);
  });

  it("disabled tune is a wire (no latency, no change)", () => {
    const chain = tuneChain({});
    chain.effects[0]!.enabled = false;
    const h = buildStudioOfflineFxChain(chain, "track", SR)!;
    const x = voice(225, 0.3);
    const l = x.slice();
    const r = x.slice();
    h.processBuffer(l, r);
    expect(l).toEqual(x);
  });
});

describe("BRD Tune — chain, keys, plans, latency compensation", () => {
  it("parses as a track effect and is rejected on master", () => {
    const chain = tuneChain({ keyRoot: 4, scale: 0 });
    expect(parseStudioFxChainForWrite(chain, { role: "track" }).effects[0]!.type).toBe("tune");
    expect(() => parseStudioFxChainForWrite(chain, { role: "master" })).toThrow();
    expect(() => addStudioFxToChain(emptyStudioFxChain(), "tune", "master")).toThrow();
    expect(() => parseStudioFxChainForWrite(tuneChain({ keyRoot: 12 }), { role: "track" })).toThrow();
  });

  it.each([
    ["Am", null, { keyRoot: 9, scale: 1 }],
    ["A", "minor", { keyRoot: 9, scale: 1 }],
    ["F#m", null, { keyRoot: 6, scale: 1 }],
    ["Db", null, { keyRoot: 1, scale: 0 }],
    ["Bb major", null, { keyRoot: 10, scale: 0 }],
    ["C-dur", null, { keyRoot: 0, scale: 0 }],
    ["a-moll", null, { keyRoot: 9, scale: 1 }],
    ["H moll", null, { keyRoot: 11, scale: 1 }],
    ["Es", "dur", { keyRoot: 3, scale: 0 }],
    ["G", "Minor", { keyRoot: 7, scale: 1 }],
  ])("parseBeatKey(%s, %s)", (key, scale, want) => {
    expect(parseBeatKey(key, scale)).toEqual(want);
  });

  it("unknown key metadata → null", () => {
    expect(parseBeatKey(null, null)).toBeNull();
    expect(parseBeatKey("", "")).toBeNull();
    expect(parseBeatKey("trap", null)).toBeNull();
    expect(parseBeatKey("X", "minor")).toBeNull();
  });

  it("formats keys in PL/EN", () => {
    expect(formatTuneKey({ keyRoot: 9, scale: 1 })).toBe("A moll");
    expect(formatTuneKey({ keyRoot: 1, scale: 0 }, "en")).toBe("C# major");
  });

  it("detects the key of a beat-like chord loop (A minor)", () => {
    const secs = 8;
    const n = SR * secs;
    const x = new Float32Array(n);
    // i – iv – VI – v in A minor: Am, Dm, F, Em (+ bass root)
    const chords = [[57, 60, 64, 45], [62, 65, 69, 50], [65, 69, 72, 53], [64, 67, 71, 52]];
    for (let i = 0; i < n; i += 1) {
      const c = chords[Math.floor((i / SR) * 0.5) % 4]!;
      let v = 0;
      for (const m of c) v += Math.sin((2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) * i) / SR);
      x[i] = 0.1 * v;
    }
    const key = detectKeyFromAudio([x], SR)!;
    expect({ keyRoot: key.keyRoot, scale: key.scale }).toEqual({ keyRoot: 9, scale: 1 });
  });

  it("plan gate: Free/Bronze natural only, Silver/Gold any style", () => {
    const hard = tuneChain(TUNE_STYLES.hard);
    const natural = tuneChain(TUNE_STYLES.natural);
    expect(findLockedTuneEffect("FREE", natural)).toBeNull();
    expect(findLockedTuneEffect("FREE", hard)?.type).toBe("tune");
    expect(findLockedTuneEffect("BRONZE", hard)).not.toBeNull();
    expect(findLockedTuneEffect("SILVER", hard)).toBeNull();
    expect(findLockedTuneEffect("GOLD", tuneChain({ retuneMs: 33, amount: 0.4 }))).toBeNull();
    const clamped = clampTuneChainForTier("FREE", hard);
    expect(tuneStyleOf(clamped.effects[0]!.params as never)).toBe("natural");
    expect(clampTuneChainForTier("SILVER", hard)).toBe(hard);
    expect(tuneParams({ keyRoot: 2, scale: 0 }, "hard")).toEqual({ keyRoot: 2, scale: 0, retuneMs: 0, amount: 1 });
  });

  it("per-sample paths start tuned clips earlier by the latency (head trimmed at 0)", () => {
    const doc = {
      timelineLengthMs: 10_000,
      masterGainDb: 0,
      masterPan: 0,
      tracks: [
        { id: "v", effectsChain: tuneChain({}) },
        { id: "b", effectsChain: null },
      ],
      clips: [
        { id: "c1", trackId: "v", timelineStartMs: 1000, sourceOffsetMs: 0, durationMs: 2000 },
        { id: "c2", trackId: "v", timelineStartMs: 10, sourceOffsetMs: 5, durationMs: 500 },
        { id: "c3", trackId: "b", timelineStartMs: 1000, sourceOffsetMs: 0, durationMs: 2000 },
      ],
    } as unknown as StudioEngineDocument;
    const out = compensateStudioTuneLatency(doc);
    expect(out.clips[0]).toMatchObject({ timelineStartMs: 1000 - TUNE_LATENCY_MS, durationMs: 2000 });
    expect(out.clips[1]).toMatchObject({ timelineStartMs: 0, sourceOffsetMs: 5 + 30, durationMs: 470 });
    expect(out.clips[2]).toBe(doc.clips[2]);
    const off = { ...doc, tracks: [{ id: "v", effectsChain: { ...tuneChain({}), effects: [{ ...tuneChain({}).effects[0]!, enabled: false }] } }] };
    expect(compensateStudioTuneLatency(off as unknown as StudioEngineDocument)).toBe(off);
  });
});
