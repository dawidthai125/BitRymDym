import { describe, expect, it } from "vitest";

import { PocketLiveCore } from "./pocket-live";
import { buildPocketWorkletSource } from "./pocket-worklet";

const SR = 8000;

function rms(buf: Float32Array, a: number, b: number): number {
  let s = 0;
  const n = Math.max(1, b - a);
  for (let i = a; i < b; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / n);
}

function tone(n: number, amp = 0.5): Float32Array {
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = amp * Math.sin((2 * Math.PI * 440 * i) / SR);
  return src;
}

describe("live rap pocket", () => {
  it("puts the hook about 6 dB above the verse before the marker", () => {
    const n = SR;
    const src = tone(n);
    const out = new Float32Array(n);
    const core = new PocketLiveCore(SR, { verseDb: -6, hookDb: 0, doubleMs: 20, doubleDb: -14, depth: 0 });
    core.setMarkers([{ kind: "hook", positionMs: 500 }]);
    core.setPlayhead(0);
    core.processBlock(src, src, out, out, n);
    const early = rms(out, 0, Math.round(0.4 * SR));
    const late = rms(out, Math.round(0.6 * SR), Math.round(0.9 * SR));
    const db = 20 * Math.log10(early / late);
    expect(Math.abs(db + 6)).toBeLessThan(1.5);
    expect(early).toBeLessThan(late);
  });

  it("with no markers uses verse gain and does not leak a double past the block", () => {
    const n = SR;
    const src = tone(n);
    const out = new Float32Array(n);
    const core = new PocketLiveCore(SR, { verseDb: -6, hookDb: 0, doubleMs: 20, doubleDb: -6, depth: 0 });
    core.setMarkers([]);
    core.setPlayhead(0);
    core.processBlock(src, src, out, out, n);
    const g = Math.pow(10, -6 / 20);
    expect(rms(out, 0, n)).toBeCloseTo(rms(src, 0, n) * g, 4);
    expect(out[100]).toBeCloseTo(src[100]! * g, 5);
    expect(out[n - 10]).toBeCloseTo(src[n - 10]! * g, 5);
    const tailN = Math.round(0.2 * SR);
    const tail = new Float32Array(tailN);
    core.processBlock(new Float32Array(tailN), new Float32Array(tailN), tail, tail, tailN);
    expect(rms(tail, 0, tailN)).toBeLessThan(1e-6);
  });

  it("keeps a -14 dB double under the dry vocal", () => {
    const n = SR;
    const src = tone(n, 0.4);
    const out = new Float32Array(n);
    const core = new PocketLiveCore(SR, { verseDb: 0, hookDb: 0, doubleMs: 20, doubleDb: -14, depth: 0 });
    core.setMarkers([{ kind: "hook", positionMs: 0 }]);
    core.setPlayhead(0);
    core.processBlock(src, src, out, out, n);
    const added = new Float32Array(n);
    for (let i = 0; i < n; i++) added[i] = out[i]! - src[i]!;
    const a = Math.round(0.04 * SR);
    expect(rms(added, a, n - a)).toBeLessThan(rms(src, a, n - a));
    const db = 20 * Math.log10(rms(added, a, n - a) / rms(src, a, n - a));
    expect(db).toBeCloseTo(-14, 0);
    expect(core.key).toBeGreaterThan(0);
    expect(core.key).toBeLessThanOrEqual(1);
  });

  it("worklet source is self-contained and named brd-pocket", () => {
    const copy = new Function(`return (${PocketLiveCore.toString()});`)() as typeof PocketLiveCore;
    const src = tone(SR / 4);
    const a = new Float32Array(src.length);
    const b = new Float32Array(src.length);
    const left = new PocketLiveCore(SR, { verseDb: -6, hookDb: 0, depth: 0, doubleDb: -24 });
    const right = new copy(SR, { verseDb: -6, hookDb: 0, depth: 0, doubleDb: -24 });
    left.setMarkers([{ kind: "hook", positionMs: 100 }]);
    right.setMarkers([{ kind: "hook", positionMs: 100 }]);
    left.setPlayhead(0);
    right.setPlayhead(0);
    left.processBlock(src, src, a, a, src.length);
    right.processBlock(src, src, b, b, src.length);
    expect(Array.from(a)).toEqual(Array.from(b));
    const moduleSrc = buildPocketWorkletSource();
    expect(moduleSrc).toContain('registerProcessor("brd-pocket"');
    expect(moduleSrc).not.toMatch(/\brequire\(|\bimport\s/);
  });
});
