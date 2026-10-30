import { describe, expect, it } from "vitest";

import { cleanupVocal, clampCleanupSettings } from "./cleanup-core";

const SR = 44100;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let e = 0;
  for (let i = a; i < b; i++) e += x[i]! * x[i]!;
  return 10 * Math.log10(e / (b - a) + 1e-20);
};
/** 0.5 s "voice" (harmonic tone) / 0.5 s pause, repeated. */
function voice(seconds: number) {
  const x = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if (Math.floor(t * 2) % 2 === 0) {
      x[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 440 * t) + 0.08 * Math.sin(2 * Math.PI * 660 * t);
    }
  }
  return x;
}

describe("vocal cleanup DSP", () => {
  it("settings are clamped with defaults", () => {
    expect(clampCleanupSettings({ noise: 3, reverb: -1 })).toEqual({ noise: 1, reverb: 0 });
    expect(clampCleanupSettings(null)).toEqual({ noise: 0.6, reverb: 0.4 });
  });

  it("STFT path reconstructs a clean signal (no pauses → no gating) at the same length, zero latency", () => {
    const x = new Float32Array(SR);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 330 * i) / SR);
    const { channels } = cleanupVocal([x], SR, { noise: 0.6, reverb: 0 });
    expect(channels[0]!.length).toBe(x.length);
    let maxErr = 0;
    for (let i = 0; i < x.length; i++) maxErr = Math.max(maxErr, Math.abs(channels[0]![i]! - x[i]!));
    expect(maxErr).toBeLessThan(1e-3);
  });

  it("removes steady noise in the pauses and keeps the voice", () => {
    const v = voice(4);
    const r = rng(7);
    const x = v.map((s) => s + 0.01 * r()); // noise ≈ -45 dBFS
    const { channels, metrics } = cleanupVocal([x], SR, { noise: 0.8, reverb: 0 });
    const y = channels[0]!;
    const gap = [Math.round(0.6 * SR), Math.round(0.9 * SR)] as const;
    const on = [Math.round(1.1 * SR), Math.round(1.4 * SR)] as const;
    expect(rmsDb(x, ...gap) - rmsDb(y, ...gap)).toBeGreaterThan(10);
    expect(Math.abs(rmsDb(x, ...on) - rmsDb(y, ...on))).toBeLessThan(1.5);
    expect(metrics.noiseReductionDb).toBeGreaterThan(10);
    expect(metrics.quietFrames).toBeGreaterThan(8);
  });

  it("shortens a room tail after the voice stops (dereverb)", () => {
    const v = voice(4);
    const r = rng(3);
    const x = new Float32Array(v.length);
    // Dry voice + diffuse exponential tail (T60 ≈ 0.6 s) — a crude room.
    const ir = new Float32Array(Math.round(0.6 * SR));
    for (let i = 0; i < ir.length; i++) ir[i] = 0.02 * r() * Math.exp((-6.9 * i) / (0.6 * SR));
    for (let i = 0; i < v.length; i += 8) {
      if (v[i] === 0) continue;
      for (let j = 0; j < ir.length && i + j < x.length; j += 1) x[i + j] += v[i]! * ir[j]!;
    }
    for (let i = 0; i < v.length; i++) x[i] += v[i]!;
    const { channels } = cleanupVocal([x], SR, { noise: 0, reverb: 1 });
    const tail = [Math.round(0.6 * SR), Math.round(0.8 * SR)] as const;
    expect(rmsDb(x, ...tail) - rmsDb(channels[0]!, ...tail)).toBeGreaterThan(3);
  });

  it("stereo: same gains on both channels, same length; zero settings = identity", () => {
    const v = voice(1);
    const { channels } = cleanupVocal([v, v.map((s) => s * 0.5)], SR, { noise: 0.5, reverb: 0.5 });
    expect(channels.length).toBe(2);
    expect(channels[1]!.length).toBe(v.length);
    for (let i = 1000; i < v.length; i += 997) expect(channels[1]![i]!).toBeCloseTo(channels[0]![i]! * 0.5, 4);
    const id = cleanupVocal([v], SR, { noise: 0, reverb: 0 });
    expect(Array.from(id.channels[0]!.slice(0, 50))).toEqual(Array.from(v.slice(0, 50)));
  });
});
