import { describe, expect, it } from "vitest";

import {
  applyNoiseProfile,
  noiseProfileFromSelection,
  spectrogramColumns,
} from "@/lib/studio/studio-clip-noise";

function lcg(n: number, amp: number): Float32Array {
  const out = new Float32Array(n);
  let s = 1;
  for (let i = 0; i < n; i += 1) {
    s = (s * 16807) % 2147483647;
    out[i] = ((s / 2147483647) * 2 - 1) * amp;
  }
  return out;
}

function sine(n: number, sr: number, hz: number, amp: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return out;
}

function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i += 1) s += (x[i] ?? 0) * (x[i] ?? 0);
  return Math.sqrt(s / Math.max(1, x.length));
}

describe("studio-clip-noise", () => {
  it("amount 0 is a copy", () => {
    const mono = sine(4096, 44100, 440, 0.4);
    const out = applyNoiseProfile(mono, 44100, { bands: [1, 2, 3] }, 0);
    expect(out).not.toBe(mono);
    expect(Array.from(out)).toEqual(Array.from(mono));
  });

  it("a loud sine survives a profile taken from quiet noise", () => {
    const sr = 48000;
    const profile = noiseProfileFromSelection(lcg(4096, 0.002), sr);
    expect(profile.bands.length).toBeGreaterThan(0);
    const tone = sine(8192, sr, 440, 0.5);
    const out = applyNoiseProfile(tone, sr, profile, 0.6);
    expect(out).toHaveLength(tone.length);
    for (let i = 0; i < out.length; i += 1) expect(Number.isFinite(out[i])).toBe(true);
    expect(rms(out) / rms(tone)).toBeGreaterThan(0.85);
  });

  it("rejects a selection shorter than 2048 samples", () => {
    expect(() => noiseProfileFromSelection(new Float32Array(2047), 44100)).toThrow(/^NOISE_TOO_SHORT/);
    expect(noiseProfileFromSelection(new Float32Array(2048), 44100).bands.length).toBeGreaterThan(0);
  });

  it("spectrogram row count follows the requested grid", () => {
    const tone = sine(4096, 44100, 220, 0.8);
    const spec = spectrogramColumns(tone, 32, 16);
    expect(spec).toHaveLength(32);
    expect(spec[0]).toHaveLength(16);
    for (const col of spec) {
      expect(col).toHaveLength(16);
      for (const v of col) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    const clamped = spectrogramColumns(tone, 1, 999);
    expect(clamped).toHaveLength(8);
    expect(clamped[0]).toHaveLength(128);
  });
});
