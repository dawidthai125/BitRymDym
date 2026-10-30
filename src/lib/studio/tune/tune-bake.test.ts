import { describe, expect, it } from "vitest";

import {
  StudioAudioEngine,
  TUNE_BAKE_DEBOUNCE_MS,
  type StudioAudioContextLike,
  type StudioAudioEngineHost,
  type StudioMediaElement,
} from "@/lib/studio/studio-audio-engine";
import type { StudioEngineClip, StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import { parseStudioFxChainForWrite } from "@/lib/studio/studio-fx-chain";
import { buildStudioOfflineFxChain } from "@/lib/studio/studio-offline-fx";

import type { TuneBakeRequest } from "./tune-bake-client";
import {
  bakedPlaybackChain,
  encodeWavPcm16,
  renderTunedSource,
  renderTunedSourceSliced,
  tuneBakeClipKey,
  tuneBakeSpecForChain,
} from "./tune-bake";

const SR = 44100;
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

function voice(f0: number, secs: number): Float32Array {
  const n = Math.round(SR * secs);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    ph += (2 * Math.PI * f0) / SR;
    let v = 0;
    for (let h = 1; h <= 12; h += 1) v += (Math.sin(h * ph) / h) * Math.exp(-((h * f0 - 700) ** 2) / (2 * 600 ** 2));
    x[i] = 0.3 * v;
  }
  return x;
}

function pitchHz(x: Float32Array, atSec: number): number {
  const a = Math.round(atSec * SR);
  const b = a + 2048;
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

const NOTE = { startMs: 500, endMs: 1500, targetMidi: 59, amount: 1, retuneMs: 0 };
const TUNE_PARAMS = { keyRoot: 9, scale: 2, retuneMs: 0, amount: 0 };
function chainWith(notes: unknown[], extra: unknown[] = []) {
  return parseStudioFxChainForWrite(
    { schemaVersion: 1, effects: [{ type: "tune", enabled: true, params: TUNE_PARAMS, notes }, ...extra] },
    { role: "track" },
  );
}
const EQ = { type: "highpass", enabled: true, params: {} };

describe("BRD Tune live notes — bake spec", () => {
  it("only a tune insert with manual notes is baked; live chain keeps the tail", () => {
    expect(tuneBakeSpecForChain(chainWith([]))).toBeNull();
    expect(tuneBakeSpecForChain(null)).toBeNull();
    const chain = chainWith([NOTE], [EQ]);
    const spec = tuneBakeSpecForChain(chain)!;
    expect(spec.tuneIndex).toBe(0);
    expect(spec.prefix).toEqual([]);
    const live = bakedPlaybackChain(chain, spec) as { effects: { type: string }[] };
    expect(live.effects.map((e) => e.type)).toEqual(["highpass"]);
  });

  it("disabled tune is not baked", () => {
    const chain = chainWith([NOTE]);
    (chain.effects[0] as { enabled: boolean }).enabled = false;
    expect(tuneBakeSpecForChain(chain)).toBeNull();
  });

  it("key is stable for the same chain + clip and changes on note / position edits", () => {
    const clip = { timelineStartMs: 1000, sourceOffsetMs: 0 };
    const a = tuneBakeSpecForChain(chainWith([NOTE]))!;
    const a2 = tuneBakeSpecForChain(chainWith([NOTE]))!;
    const b = tuneBakeSpecForChain(chainWith([{ ...NOTE, targetMidi: 60 }]))!;
    const k = tuneBakeClipKey(a, clip, "take:x", 48000);
    expect(tuneBakeClipKey(a2, clip, "take:x", 48000)).toBe(k);
    expect(tuneBakeClipKey(b, clip, "take:x", 48000)).not.toBe(k);
    expect(tuneBakeClipKey(a, { ...clip, timelineStartMs: 1200 }, "take:x", 48000)).not.toBe(k);
    expect(tuneBakeClipKey(a, clip, "take:y", 48000)).not.toBe(k);
    // Trim from the left (start + offset move together) keeps the anchor → same bake.
    expect(tuneBakeClipKey(a, { timelineStartMs: 1300, sourceOffsetMs: 300 }, "take:x", 48000)).toBe(k);
  });
});

describe("BRD Tune live notes — DSP (same engine as render)", () => {
  const a3 = voice(midiHz(57), 2);

  it("baked clip at timeline 0 equals the E3 whole-buffer render", () => {
    const chain = chainWith([NOTE]);
    const spec = tuneBakeSpecForChain(chain)!;
    const baked = renderTunedSource({ left: a3.slice(), right: a3.slice(), sampleRate: SR, prefix: spec.prefix, tune: spec.tune, originMs: 0 });
    const l = a3.slice();
    const r = a3.slice();
    buildStudioOfflineFxChain(chain, "track", SR)!.processBuffer(l, r);
    let maxDiff = 0;
    for (let i = 0; i < l.length; i += 1) maxDiff = Math.max(maxDiff, Math.abs(l[i]! - baked.left[i]!));
    expect(maxDiff).toBeLessThan(1e-5);
    expect(Math.abs(cents(pitchHz(baked.left, 1.0), midiHz(59)))).toBeLessThan(15);
    expect(Math.abs(cents(pitchHz(baked.left, 0.2), midiHz(57)))).toBeLessThan(15);
  });

  it("sliced (non-blocking) bake is identical to the one-shot bake", async () => {
    const spec = tuneBakeSpecForChain(chainWith([NOTE]))!;
    const job = () => ({ left: a3.slice(), right: a3.slice(), sampleRate: SR, prefix: [], tune: spec.tune, originMs: 250 });
    const one = renderTunedSource(job());
    let yields = 0;
    const sliced = await renderTunedSourceSliced(job(), { sliceSamples: 4096, yieldNow: async () => void (yields += 1) });
    expect(yields).toBeGreaterThan(10);
    expect(sliced.left).toEqual(one.left);
    const ac = new AbortController();
    ac.abort();
    await expect(renderTunedSourceSliced(job(), { signal: ac.signal })).rejects.toThrow();
  });

  it("clip placed later on the timeline moves the note where the timeline says", () => {
    // Clip starts at 400 ms → timeline note 500–1500 ms = source 100–1100 ms.
    const spec = tuneBakeSpecForChain(chainWith([NOTE]))!;
    const baked = renderTunedSource({ left: a3.slice(), right: a3.slice(), sampleRate: SR, prefix: [], tune: spec.tune, originMs: 400 });
    expect(Math.abs(cents(pitchHz(baked.left, 0.6), midiHz(59)))).toBeLessThan(15);
    expect(Math.abs(cents(pitchHz(baked.left, 1.5), midiHz(57)))).toBeLessThan(15);
  });

  it("encodes a 16-bit stereo WAV", () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 0]), 48000);
    const v = new DataView(wav);
    expect(wav.byteLength).toBe(44 + 12);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getInt16(44 + 4, true)).toBe(0x7fff);
    expect(v.getInt16(44 + 8, true)).toBe(-0x8000);
  });
});

// ---------------------------------------------------------------- engine ----

function fakeNode() {
  return { gain: { value: 1 }, pan: { value: 0 }, connect: (d: never) => d, disconnect() {} };
}

function createHost(played: string[], bake: StudioAudioEngineHost["bakeTune"], revoked: string[]): StudioAudioEngineHost {
  let time = 0;
  const ctx = {
    currentTime: 0,
    state: "running",
    sampleRate: 44100,
    destination: fakeNode(),
    async resume() {},
    async close() {},
    createGain: () => fakeNode(),
    createStereoPanner: () => fakeNode(),
    createAnalyser: () => ({ ...fakeNode(), fftSize: 256, smoothingTimeConstant: 0, frequencyBinCount: 128, getFloatTimeDomainData: (a: Float32Array) => a.fill(0) }),
    createMediaElementSource: () => fakeNode(),
  } as unknown as StudioAudioContextLike;
  return {
    createContext: () => ctx,
    createMediaElement() {
      const el: StudioMediaElement = {
        src: "",
        currentTime: 0,
        paused: true,
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        async play() {
          this.paused = false;
          played.push(this.src);
        },
        pause() {
          this.paused = true;
        },
        load() {},
      };
      return el;
    },
    nowMs: () => (time += 16),
    requestTick: () => 1,
    cancelTick() {},
    bakeTune: bake,
    revokeUrl: (u) => revoked.push(u),
  };
}

const TAKE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const vocalClip: StudioEngineClip = {
  id: "c1",
  trackId: "vocal",
  sourceKind: "TAKE",
  sourceTakeId: TAKE,
  sourceBeatId: null,
  sourceOffsetMs: 0,
  timelineStartMs: 0,
  durationMs: 5000,
  gainDb: 0,
  muted: false,
  fadeInMs: 0,
  fadeOutMs: 0,
};
function doc(effectsChain: unknown): StudioEngineDocument {
  return {
    timelineLengthMs: 20_000,
    masterGainDb: 0,
    masterPan: 0,
    tracks: [{ id: "vocal", gainDb: 0, pan: 0, muted: false, solo: false, effectsChain }],
    clips: [vocalClip],
  };
}
const settle = (ms = TUNE_BAKE_DEBOUNCE_MS + 60) => new Promise((r) => setTimeout(r, ms));

function setup(bakeImpl?: (req: TuneBakeRequest, n: number) => Promise<string | null>) {
  const played: string[] = [];
  const revoked: string[] = [];
  const reqs: TuneBakeRequest[] = [];
  const pending: (readonly string[])[] = [];
  let n = 0;
  const bake = async (req: TuneBakeRequest) => {
    reqs.push(req);
    n += 1;
    return bakeImpl ? bakeImpl(req, n) : `blob:baked-${n}`;
  };
  const registry = createStudioSourceAdapterRegistry(
    createDefaultStudioSourceAdapters({
      resolveBeatUrl: async () => ({ url: "https://cdn.example/beat.mp3", expiresAt: Date.now() + 60_000 }),
      resolveTakeUrl: async (id) => ({ url: `https://cdn.example/${id}.wav`, expiresAt: Date.now() + 60_000 }),
    }),
  );
  const engine = new StudioAudioEngine({
    registry,
    host: createHost(played, bake, revoked),
    listener: {
      onPlayhead: () => undefined,
      onLifecycle: () => undefined,
      onError: () => undefined,
      onTimelineEnded: () => undefined,
      onTuneBake: (p) => pending.push(p),
    },
  });
  return { engine, played, revoked, reqs, pending };
}

describe("BRD Tune live notes — engine", () => {
  it("plays realtime while baking, then the baked take; edits rebake and swap", async () => {
    const { engine, played, reqs, pending, revoked } = setup();
    engine.setDocument(doc(chainWith([NOTE])));
    expect(pending.at(-1)).toEqual(["vocal"]);
    await engine.play(1000);
    expect(played.at(-1)).toBe(`https://cdn.example/${TAKE}.wav`);
    await settle();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ url: `https://cdn.example/${TAKE}.wav`, sampleRate: 48000, originMs: 0 });
    expect(reqs[0]!.tune.notes).toHaveLength(1);
    expect(pending.at(-1)).toEqual([]);
    expect(played.at(-1)).toBe("blob:baked-1");

    // Edit a note → keeps the previous bake while the new one renders.
    engine.setDocument(doc(chainWith([{ ...NOTE, targetMidi: 60 }])));
    expect(pending.at(-1)).toEqual(["vocal"]);
    await settle();
    expect(reqs).toHaveLength(2);
    expect(played.at(-1)).toBe("blob:baked-2");

    // Undo → old bake reused instantly, no new bake.
    engine.setDocument(doc(chainWith([NOTE])));
    expect(pending.at(-1)).toEqual([]);
    await settle();
    expect(reqs).toHaveLength(2);
    expect(played.at(-1)).toBe("blob:baked-1");

    // Notes cleared → realtime again.
    engine.setDocument(doc(chainWith([])));
    await settle();
    expect(played.at(-1)).toBe(`https://cdn.example/${TAKE}.wav`);
    engine.dispose();
    expect(revoked).toEqual(expect.arrayContaining(["blob:baked-1", "blob:baked-2"]));
  });

  it("rapid edits bake only the last chain", async () => {
    const { engine, reqs } = setup();
    engine.setDocument(doc(chainWith([{ ...NOTE, targetMidi: 58 }])));
    engine.setDocument(doc(chainWith([{ ...NOTE, targetMidi: 59 }])));
    engine.setDocument(doc(chainWith([{ ...NOTE, targetMidi: 60 }])));
    await settle(TUNE_BAKE_DEBOUNCE_MS * 3 + 100);
    expect(reqs.map((r) => r.tune.notes?.[0]?.targetMidi)).toEqual([60]);
    engine.dispose();
  });

  it("failed bake falls back to realtime and clears the pending state", async () => {
    const { engine, played, pending } = setup(async () => null);
    engine.setDocument(doc(chainWith([NOTE])));
    await engine.play(1000);
    await settle();
    expect(pending.at(-1)).toEqual([]);
    expect(played.every((u) => u.startsWith("https://"))).toBe(true);
    engine.dispose();
  });

  it("tracks without manual notes never bake", async () => {
    const { engine, reqs, pending } = setup();
    engine.setDocument(doc(chainWith([])));
    await settle();
    expect(reqs).toHaveLength(0);
    expect(pending).toHaveLength(0);
    engine.dispose();
  });
});
