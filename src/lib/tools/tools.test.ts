import { describe, expect, it } from "vitest";

import { estimateBpm, tapTempo } from "@/lib/tools/bpm";
import { draw, FREESTYLE_TOPICS, FREESTYLE_WORDS } from "@/lib/tools/freestyle";
import { levelOf, meterPercent, micVerdict } from "@/lib/tools/mic-level";
import { semitoneShift, slowedSeconds } from "@/lib/tools/slowed";
import { countLines, countWordSyllables, summarize, syllableCountLabel } from "@/lib/tools/syllables";
import { encodeWav16, limitPeak } from "@/lib/tools/wav";

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

describe("freestyle draw", () => {
  it("has over a hundred unique topics and words and never repeats before the list ends", () => {
    for (const list of [FREESTYLE_TOPICS, FREESTYLE_WORDS]) {
      expect(list.length).toBeGreaterThanOrEqual(100);
      expect(new Set(list).size).toBe(list.length);
    }
    let bag: readonly string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < FREESTYLE_TOPICS.length; i++) {
      const r = draw(bag, FREESTYLE_TOPICS, 1);
      bag = r.bag;
      seen.push(...r.picked);
    }
    expect(new Set(seen).size).toBe(FREESTYLE_TOPICS.length);
    expect(draw<string>([], FREESTYLE_WORDS, 3).picked).toHaveLength(3);
  });
});

describe("mic level", () => {
  it("measures a full-scale sine and gives a verdict", () => {
    const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 4800));
    const l = levelOf(sine);
    expect(l.peakDb).toBeCloseTo(0, 1);
    expect(l.rmsDb).toBeCloseTo(-3.01, 1);
    expect(levelOf(new Float32Array(16)).rmsDb).toBe(-100);
    expect([-80, -30, -10, 0].map(micVerdict)).toEqual(["silence", "quiet", "good", "hot"]);
    expect([meterPercent(-100), meterPercent(-30), meterPercent(0)]).toEqual([0, 50, 100]);
  });
});

describe("slowed + WAV", () => {
  it("computes length and pitch", () => {
    expect(slowedSeconds(85, { speed: 85, reverb: 30, tail: 3 })).toBe(103);
    expect(slowedSeconds(60, { speed: 120, reverb: 0, tail: 3 })).toBe(50);
    expect(semitoneShift(85)).toBe(-2.8);
    expect(semitoneShift(100)).toBe(0);
  });
  it("writes a valid stereo header and only ever turns peaks down", () => {
    const l = new Float32Array([0, 2, -2]);
    const r = new Float32Array([0, 1, -1]);
    expect(limitPeak([l, r])).toBeCloseTo(0.485);
    expect(limitPeak([new Float32Array([0.1])])).toBe(1);
    const view = new DataView(encodeWav16([l, r], 44100));
    expect(view.byteLength).toBe(44 + 12);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(176400);
    expect(view.getInt16(48, true)).toBe(Math.round(Math.fround(0.97) * 32767));
  });
});

describe("syllable label", () => {
  it("declines", () => {
    expect([1, 2, 5].map(syllableCountLabel)).toEqual(["1 sylabę", "2 sylaby", "5 sylab"]);
  });
});
