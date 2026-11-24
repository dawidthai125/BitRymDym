import { describe, expect, it } from "vitest";

import { ALIGN_RATE, beatClipAt, bleedLag, headphonesLikely, readHeadphones, toAlignRate, writeHeadphones } from "./auto-align";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

/** A looped beat: the same kick, snare and hi-hat samples again and again at 90 BPM, plus a bass line. */
function beat(seconds: number): Float32Array {
  const out = new Float32Array(seconds * ALIGN_RATE);
  const noise = rng(7);
  const hat = Float32Array.from({ length: 500 }, (_, i) => noise() * Math.exp(-i / 90));
  const snare = Float32Array.from({ length: 1800 }, (_, i) => noise() * Math.exp(-i / 500));
  const kick = Float32Array.from({ length: 2400 }, (_, i) => Math.sin(2 * Math.PI * (45 + 120 * Math.exp(-i / 300)) * (i / ALIGN_RATE)) * Math.exp(-i / 700));
  const step = Math.round((ALIGN_RATE * 60) / 90 / 4);
  const add = (s: Float32Array, at: number, g: number) => {
    for (let i = 0; i < s.length && at + i < out.length; i += 1) out[at + i]! += s[i]! * g;
  };
  const notes = [0, 0, 3, 5, 0, 7, 3, 10];
  for (let k = 0; k * step < out.length; k += 1) {
    add(hat, k * step, k % 4 === 2 ? 0.35 : 0.2);
    if (k % 8 === 4) add(snare, k * step, 0.5);
    if (k % 16 === 0 || k % 16 === 6 || k % 16 === 10) add(kick, k * step, 0.8);
    const f = 220 * 2 ** (notes[Math.floor(k / 4) % 8]! / 12);
    for (let i = 0; i < step && k * step + i < out.length; i += 1) out[k * step + i]! += 0.12 * Math.sign(Math.sin((2 * Math.PI * f * i) / ALIGN_RATE)) * Math.exp(-i / step);
  }
  return out;
}

/** Rap-like voice: pitched bursts with formants and pauses. */
function voice(seconds: number, seed: number): Float32Array {
  const out = new Float32Array(seconds * ALIGN_RATE);
  const r = rng(seed);
  let at = Math.round(ALIGN_RATE * 0.6);
  while (at < out.length) {
    const len = Math.round(ALIGN_RATE * (0.09 + 0.12 * Math.abs(r())));
    const f0 = 105 + 40 * Math.abs(r());
    const f1 = 400 + 500 * Math.abs(r());
    for (let i = 0; i < len && at + i < out.length; i += 1) {
      const t = i / ALIGN_RATE;
      const env = Math.sin((Math.PI * i) / len);
      let v = 0;
      for (let h = 1; h < 24; h += 1) v += Math.sin(2 * Math.PI * f0 * h * t) / (1 + Math.abs(f0 * h - f1) / 200);
      out[at + i] = 0.1 * env * v + 0.03 * env * r();
    }
    at += len + Math.round(ALIGN_RATE * (0.02 + (r() > 0.6 ? 0.5 : 0.04)));
  }
  return out;
}

/** What the microphone gets: voice, room noise and the beat `lagMs` late, `bleedDb` below the beat itself. */
function take(opts: { seconds: number; lagMs: number; bleedDb: number; voice?: number; noiseDb?: number; seed?: number }) {
  const b = beat(opts.seconds);
  const v = voice(opts.seconds, opts.seed ?? 3);
  const n = rng((opts.seed ?? 3) + 99);
  const out = new Float32Array(b.length);
  const gain = 10 ** (opts.bleedDb / 20);
  const noise = 10 ** ((opts.noiseDb ?? -62) / 20);
  const delay = (opts.lagMs * ALIGN_RATE) / 1000;
  let lp = 0;
  for (let i = 0; i < out.length; i += 1) {
    const p = i - delay;
    const k = Math.floor(p);
    const bleed = k >= 0 ? b[k]! * (1 - (p - k)) + (b[k + 1] ?? 0) * (p - k) : 0;
    lp += 0.45 * (bleed - lp);
    out[i] = lp * gain + v[i]! * (opts.voice ?? 1) + n() * noise;
  }
  return { mic: out, beat: b };
}

describe("bleedLag", () => {
  it.each([
    [18, -30],
    [83, -34],
    [142, -44],
    [260, -34],
  ])("finds %i ms in a rapped take with the beat %i dB down", async (lagMs, bleedDb) => {
    const { mic, beat: b } = take({ seconds: 14, lagMs, bleedDb });
    const r = await bleedLag(mic, b);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.lagMs - lagMs)).toBeLessThan(1.5);
  });

  it("says nothing without a trace of the beat", async () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { mic, beat: b } = take({ seconds: 12, lagMs: 90, bleedDb: -200, seed });
      expect(await bleedLag(mic, b)).toBeNull();
    }
  });

  it("never gives a wrong answer when the trace is drowned", async () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const { mic, beat: b } = take({ seconds: 10, lagMs: 110, bleedDb: -44 - (seed % 4) * 4, seed, noiseDb: -50 });
      const r = await bleedLag(mic, b);
      if (!r) continue;
      expect(Math.abs(r.lagMs - 110)).toBeLessThan(2);
    }
  });

  it("works without a voice, refuses short takes and a silent beat", async () => {
    const quiet = take({ seconds: 8, lagMs: 60, bleedDb: -46, voice: 0 });
    expect(Math.abs(((await bleedLag(quiet.mic, quiet.beat))?.lagMs ?? 999) - 60)).toBeLessThan(1.5);
    const short = take({ seconds: 3, lagMs: 60, bleedDb: -20 });
    expect(await bleedLag(short.mic, short.beat)).toBeNull();
    expect(await bleedLag(quiet.mic, new Float32Array(quiet.beat.length))).toBeNull();
  });
});

it("toAlignRate keeps events in place", () => {
  const src = new Float32Array(48_000);
  src[24_000] = 1;
  const out = toAlignRate(src, 48_000);
  expect(out).toHaveLength(ALIGN_RATE);
  expect(out.indexOf(Math.max(...out))).toBe(6_000);
  expect(toAlignRate(out, ALIGN_RATE)).toBe(out);
});

it("beatClipAt takes only a plain, audible beat clip that still plays for a while", () => {
  const tracks = [{ id: "b", muted: false, solo: false }, { id: "v", muted: false, solo: false }];
  const clip = { trackId: "b", sourceKind: "BEAT_REF", timelineStartMs: 0, durationMs: 60_000, sourceOffsetMs: 0, muted: false };
  expect(beatClipAt([clip], tracks, 5_000)).toBe(clip);
  expect(beatClipAt([clip], tracks, 58_000)).toBeNull();
  for (const bad of [{ muted: true }, { stretchRatio: 1.2 }, { pitchCents: 100 }, { scratchRate: 0.5 }, { sourceKind: "TAKE" }])
    expect(beatClipAt([{ ...clip, ...bad }], tracks, 0)).toBeNull();
  expect(beatClipAt([clip], [{ ...tracks[0]!, muted: true }, tracks[1]!], 0)).toBeNull();
  expect(beatClipAt([clip], [tracks[0]!, { ...tracks[1]!, solo: true }], 0)).toBeNull();
});

it("headphones from device names, and the user's own answer wins", () => {
  expect(headphonesLikely(["Microphone Array (Intel Smart Sound)", "Speakers (Realtek)"])).toBe(false);
  expect(headphonesLikely(["iPhone Microphone", null])).toBe(false);
  expect(headphonesLikely(["Mikrofon", "Słuchawki (Realtek)"])).toBe(true);
  expect(headphonesLikely(["Scarlett Solo USB", undefined])).toBe(true);
  expect(headphonesLikely(["Headset Microphone (HyperX Cloud)"])).toBe(true);
  const m = new Map<string, string>();
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  expect(readHeadphones(st, "a|b")).toBeNull();
  writeHeadphones(st, "a|b", true);
  writeHeadphones(st, "c|d", false);
  expect([readHeadphones(st, "a|b"), readHeadphones(st, "c|d"), readHeadphones(st, "x|y")]).toEqual([true, false, null]);
});
