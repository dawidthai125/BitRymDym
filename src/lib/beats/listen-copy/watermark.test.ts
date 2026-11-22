import { describe, expect, it } from "vitest";

import {
  detectWatermark,
  embedWatermark,
  toMono,
  watermarkPattern,
  watermarkSeed,
} from "@/lib/beats/listen-copy/watermark";

const SR = 44_100;
const IDS = ["c0000000-0000-4000-8000-000000000001", "c0000000-0000-4000-8000-000000000002", "c0000000-0000-4000-8000-000000000003"];

/** Deterministic "music": two tones + pseudo noise, stereo, `seconds` long. */
function music(seconds: number): Float32Array {
  const n = SR * seconds;
  const out = new Float32Array(n * 2);
  let x = 12345;
  let level = 0.5;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    // A new loudness every ~0.1 s (like hits and bars), so the file has a shape to align on.
    if (i % 4410 === 0) level = 0.2 + ((x >>> 16) / 0xffff) * 0.8;
    const noise = ((x >>> 8) / 0xffffff - 0.5) * 0.1;
    const v = level * (0.3 * Math.sin((2 * Math.PI * 110 * i) / SR) + 0.1 * Math.sin((2 * Math.PI * 440 * i) / SR) + noise);
    out[2 * i] = v;
    out[2 * i + 1] = v * 0.9;
  }
  return out;
}

describe("listen copy watermark", () => {
  it("seed and pattern are deterministic per copy id, different across ids", () => {
    expect(watermarkSeed(IDS[0])).toBe(watermarkSeed(IDS[0]));
    expect(watermarkSeed(IDS[0])).not.toBe(watermarkSeed(IDS[1]));
    const a = watermarkPattern(watermarkSeed(IDS[0]), 1000);
    expect(Array.from(a)).toEqual(Array.from(watermarkPattern(watermarkSeed(IDS[0]), 1000)));
  });

  it("is far below the music (≤ -40 dB) and finds the right copy, also shifted and quieter", () => {
    const master = music(6);
    const marked = embedWatermark(master, 2, IDS[1]);
    let s = 0, e = 0;
    for (let i = 0; i < master.length; i++) { s += master[i] ** 2; e += (marked[i] - master[i]) ** 2; }
    expect(10 * Math.log10(e / s)).toBeLessThan(-40);

    const shift = 12_345;
    const mono = toMono(marked, 2);
    const leak = new Float32Array(mono.length - shift);
    for (let i = 0; i < leak.length; i++) leak[i] = mono[i + shift] * 0.7;
    const r = detectWatermark(leak, toMono(master, 2), IDS, SR);
    expect(r.offset).toBe(-shift);
    expect(r.scores[0].copyId).toBe(IDS[1]);
    expect(r.scores[0].z).toBeGreaterThan(20);
    for (const other of r.scores.slice(1)) expect(Math.abs(other.z)).toBeLessThan(5);
  });

  it("an unmarked file matches nobody", () => {
    const master = music(4);
    const r = detectWatermark(toMono(master, 2), toMono(master, 2), IDS, SR);
    for (const s of r.scores) expect(Math.abs(s.z)).toBeLessThan(5);
  });
});
