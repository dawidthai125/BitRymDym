import { describe, expect, it } from "vitest";

import { VocalHarmonyCore } from "./vocal-harmony";

const SR = 8000;

function tone(buf: Float32Array, freq: number, a: number, b: number): number {
  let s = 0;
  let c = 0;
  for (let i = a; i < b; i++) {
    const w = (2 * Math.PI * freq * i) / SR;
    s += buf[i]! * Math.sin(w);
    c += buf[i]! * Math.cos(w);
  }
  return Math.hypot(s, c);
}

describe("vocal harmony", () => {
  it("stays dry when amount is 0", () => {
    const n = SR;
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const out = new Float32Array(n);
    new VocalHarmonyCore(SR, { amount: 0 }).processBlock(src, src, out, out, n);
    let err = 0;
    for (let i = 0; i < n; i++) err += Math.abs(out[i]! - src[i]!);
    expect(err / n).toBeLessThan(1e-6);
  });

  it("adds a lower voice under a sung tone and leaves a pause quiet", () => {
    const n = SR * 2;
    const src = new Float32Array(n);
    for (let i = 0; i < SR; i++) src[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const out = new Float32Array(n);
    new VocalHarmonyCore(SR, { amount: 1 }).processBlock(src, src, out, out, n);
    const wet = new Float32Array(n);
    for (let i = 0; i < n; i++) wet[i] = out[i]! - src[i]!;
    const low = tone(wet, 220 * Math.pow(2, -7 / 12), 800, SR - 200);
    const mid = tone(wet, 220, 800, SR - 200);
    const high = tone(wet, 220 * Math.pow(2, 3 / 12), 800, SR - 200);
    expect(low).toBeGreaterThan(mid * 2);
    expect(high).toBeGreaterThan(mid);
    let pause = 0;
    const from = SR + Math.round(SR * 0.12);
    for (let i = from; i < n; i++) pause += wet[i]! * wet[i]!;
    expect(Math.sqrt(pause / (n - from))).toBeLessThan(0.02);
  });
});
