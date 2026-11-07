import { describe, expect, it } from "vitest";

import { VocalLevelCore } from "./vocal-level";

const SR = 16000;

function rms(buf: Float32Array, a: number, b: number): number {
  let s = 0;
  const n = Math.max(1, b - a);
  for (let i = a; i < b; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / n);
}

describe("vocal rider", () => {
  it("leaves the signal alone when amount is 0", () => {
    const n = SR;
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = i < n / 2 ? 0.4 : 0.05;
    const out = new Float32Array(n);
    new VocalLevelCore(SR, { amount: 0, maxBoostDb: 12, maxCutDb: 12 }).processBlock(src, src, out, out, n);
    expect(rms(out, 1000, 7000)).toBeCloseTo(rms(src, 1000, 7000), 3);
  });

  it("lifts a quiet word toward the phrase and leaves the pause alone", () => {
    const n = SR * 2;
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < SR * 0.5) src[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / SR);
      else if (i < SR * 1.2) src[i] = 0.08 * Math.sin((2 * Math.PI * 220 * i) / SR);
    }
    const out = new Float32Array(n);
    new VocalLevelCore(SR, { amount: 1, maxBoostDb: 12, maxCutDb: 6 }).processBlock(src, src, out, out, n);
    const loud = rms(out, 2000, 7000);
    const quiet = rms(out, SR + 2000, SR + 8000);
    const rawLoud = rms(src, 2000, 7000);
    const rawQuiet = rms(src, SR + 2000, SR + 8000);
    expect(quiet / loud).toBeGreaterThan(rawQuiet / rawLoud + 0.05);
    expect(rms(out, SR * 1.5, n - 100)).toBeLessThan(0.01);
  });
});
