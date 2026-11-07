import { describe, expect, it } from "vitest";

import { VoiceShiftCore } from "./voice-shift";

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

describe("voice shift", () => {
  it("stays dry when mix is 0", () => {
    const n = SR;
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const out = new Float32Array(n);
    new VoiceShiftCore(SR, { color: 0, mix: 0 }).processBlock(src, src, out, out, n);
    let err = 0;
    for (let i = 0; i < n; i++) err += Math.abs(out[i]! - src[i]!);
    expect(err / n).toBeLessThan(1e-6);
  });

  it("moves a sung tone down", () => {
    const n = SR * 2;
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const out = new Float32Array(n);
    new VoiceShiftCore(SR, { color: 0, mix: 1 }).processBlock(src, src, out, out, n);
    const low = tone(out, 220 * Math.pow(2, -5 / 12), 1000, n - 200);
    const mid = tone(out, 220, 1000, n - 200);
    expect(low).toBeGreaterThan(mid * 2);
  });
});
