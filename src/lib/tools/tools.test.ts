import { describe, expect, it } from "vitest";

import { estimateBpm, tapTempo } from "@/lib/tools/bpm";
import { countLines, countWordSyllables, summarize } from "@/lib/tools/syllables";

describe("Polish syllables", () => {
  it("counts vowels, skipping softening i", () => {
    expect(countWordSyllables("nie")).toBe(1);
    expect(countWordSyllables("się")).toBe(1);
    expect(countWordSyllables("pierwszy")).toBe(2);
    expect(countWordSyllables("ulica")).toBe(3);
    expect(countWordSyllables("miłość")).toBe(2);
    expect(countWordSyllables("auto")).toBe(2);
    expect(countWordSyllables("nauka")).toBe(3);
    expect(countWordSyllables("w")).toBe(0);
    expect(countWordSyllables("Przyjaciel,")).toBe(3);
  });
  it("counts lines and totals", () => {
    const lines = countLines("Nagrywam zwrotkę w nocy\n\nbit leci, mikrofon gotowy");
    expect(lines.map((l) => l.syllables)).toEqual([7, 0, 9]);
    expect(summarize(lines)).toEqual({ lines: 2, syllables: 16, words: 8, average: 8 });
  });
});

describe("tempo", () => {
  it("tap tempo", () => {
    expect(tapTempo([0])).toBeNull();
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
  });
  it("finds the tempo of a click track", () => {
    const sr = 22050;
    const bpm = 92;
    const samples = new Float32Array(sr * 30);
    const period = (60 / bpm) * sr;
    for (let beat = 0; beat * period < samples.length; beat++) {
      const at = Math.round(beat * period);
      for (let i = 0; i < 400 && at + i < samples.length; i++) samples[at + i] = Math.exp(-i / 80) * Math.sin(i * 0.3);
    }
    const est = estimateBpm(samples, sr)!;
    expect(Math.abs(est.bpm - bpm)).toBeLessThan(1.5);
  });
});
