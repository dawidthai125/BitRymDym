import { describe, expect, it } from "vitest";

import { analysisWindow, measureFromPcm } from "./reference-measure-browser";
import { estimateTempo } from "./reference-tempo-dsp";

const SR = 22_050;

/** Synthetic drum loop: kick on 1 and 3, snare on 2 and 4, closed hats on 8ths, with a little noise. */
function drums(bpm: number, seconds: number, halfTimeSnare = false): Float32Array {
  const x = new Float32Array(SR * seconds);
  const beat = (60 / bpm) * SR;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const hit = (at: number, len: number, f: (t: number, i: number) => number) => {
    for (let i = 0; i < len && at + i < x.length; i++) x[Math.floor(at) + i] += f(i / SR, i);
  };
  for (let b = 0; b * beat < x.length; b++) {
    const t0 = b * beat;
    const inBar = b % 4;
    if (inBar === 0 || (!halfTimeSnare && inBar === 2)) hit(t0, 6000, (t) => Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * Math.exp(-t * 12) * 0.9);
    if (halfTimeSnare ? inBar === 2 : inBar === 1 || inBar === 3) hit(t0, 4000, (t) => rnd() * Math.exp(-t * 25) * 0.6);
    hit(t0, 800, (t) => rnd() * Math.exp(-t * 120) * 0.25);
    hit(t0 + beat / 2, 800, (t) => rnd() * Math.exp(-t * 120) * 0.2);
  }
  for (let i = 0; i < x.length; i++) x[i] += rnd() * 0.01;
  return x;
}

describe("reference tempo (whole song)", () => {
  it.each([72, 85, 90, 97.5, 140])("reads %s BPM within 1 BPM or as its half/double", (bpm) => {
    const r = estimateTempo(drums(bpm, 40), SR)!;
    expect(r).not.toBeNull();
    const ok = [bpm, bpm / 2, bpm * 2].some((b) => Math.abs(r.bpm - b) <= 1) ;
    expect(ok).toBe(true);
    expect(r.candidates.some((c) => Math.abs(c - bpm) <= 1)).toBe(true);
  });

  it("keeps a plain boom-bap pattern on its own tempo, not double", () => {
    expect(estimateTempo(drums(88, 40), SR)!.bpm).toBe(88);
  });

  it("returns nothing for too little audio", () => {
    expect(estimateTempo(new Float32Array(SR * 3), SR)).toBeNull();
    expect(measureFromPcm(new Float32Array(SR * 3), SR)).toBeNull();
  });

  it("skips the intro but keeps the window inside the song", () => {
    expect(analysisWindow(240)).toEqual({ start: 30, length: 180 });
    expect(analysisWindow(100)).toEqual({ start: 0, length: 100 });
    expect(analysisWindow(190)).toEqual({ start: 10, length: 180 });
  });
});

describe("reference measure for the brief", () => {
  it("leaves half/double time open but offers only the pulse and its octave", () => {
    const m = measureFromPcm(drums(90, 40), SR)!;
    expect(m.bpm).toBe(90);
    expect(m.candidates).toContain(90);
    expect(m.candidates.every((c) => [45, 90, 180].includes(c))).toBe(true);
  });
});
