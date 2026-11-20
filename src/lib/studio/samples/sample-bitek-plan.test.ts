import { describe, expect, it } from "vitest";

import { keyShiftSemitones, parseMusicalKey, planSamplePlacement, stretchForTempo } from "./sample-bitek-plan";

const project = { bpm: 90, key: "Cm", timelineLengthMs: 120_000, beatsPerBar: 4, markers: [] as { kind: string; positionMs: number }[] };
const barMs = (4 * 60_000) / 90;

describe("Bitek sample placement", () => {
  it("reads keys and notes", () => {
    expect(parseMusicalKey("Am")).toEqual({ pc: 9, minor: true });
    expect(parseMusicalKey("F#")).toEqual({ pc: 6, minor: false });
    expect(parseMusicalKey("Bb minor")).toEqual({ pc: 10, minor: true });
    expect(parseMusicalKey("A2")).toEqual({ pc: 9, minor: null });
    expect(parseMusicalKey("H")).toBeNull();
  });

  it("shifts by the smallest interval and treats relative keys as equal", () => {
    expect(keyShiftSemitones("Am", "Cm")).toBe(3);
    expect(keyShiftSemitones("Am", "C")).toBe(0);
    expect(keyShiftSemitones("Dm", "Am")).toBe(-5);
    expect(keyShiftSemitones("G", "F#")).toBe(-1);
    expect(keyShiftSemitones(null, "C")).toBeNull();
  });

  it("fits tempo with the smallest stretch, using half/double time when needed", () => {
    expect(stretchForTempo(90, 90)).toEqual({ stretch: 1, feel: "same" });
    expect(stretchForTempo(85, 90)?.stretch).toBeCloseTo(85 / 90, 5);
    expect(stretchForTempo(170, 80)?.feel).toBe("double");
    expect(stretchForTempo(60, 140)?.feel).toBe("half");
  });

  it("repeats a 4-bar loop over the whole song, tempo- and key-matched", () => {
    const loopMs = ((4 * 4 * 60) / 85) * 1000;
    const plan = planSamplePlacement({
      sample: { type: "loop", bpm: 85, key: "Am", bars: 4, durationMs: loopMs },
      project,
      playheadMs: 0,
      scope: "song",
      canPitch: true,
    });
    expect(plan.stretch).toBeCloseTo(85 / 90, 3);
    expect(plan.pitchCents).toBe(300);
    expect(plan.gainDb).toBe(-6);
    expect(plan.starts[1] - plan.starts[0]).toBe(Math.round(4 * barMs));
    expect(plan.starts.at(-1)! + 4 * barMs).toBeLessThanOrEqual(120_000 + 1);
    expect(plan.explain.key).toMatchObject({ from: "Am", to: "Cm", semitones: 3, applied: true });
  });

  it("does not change pitch below Silver but says so", () => {
    const plan = planSamplePlacement({
      sample: { type: "loop", bpm: 90, key: "Am", bars: 2, durationMs: 2 * barMs },
      project,
      playheadMs: 0,
      scope: "once",
      canPitch: false,
    });
    expect(plan.pitchCents).toBe(0);
    expect(plan.explain.key?.applied).toBe(false);
    expect(plan.starts).toEqual([0]);
  });

  it("snaps to the nearest bar and fills only the current section", () => {
    const markers = [
      { kind: "verse", positionMs: 0 },
      { kind: "hook", positionMs: Math.round(16 * barMs) },
    ];
    const plan = planSamplePlacement({
      sample: { type: "loop", bpm: 90, key: null, bars: 4, durationMs: 4 * barMs },
      project: { ...project, markers },
      playheadMs: 8 * barMs + 300,
      scope: "section",
      canPitch: true,
    });
    expect(plan.starts[0]).toBe(Math.round(8 * barMs));
    expect(plan.starts).toHaveLength(2);
    expect(plan.explain.section).toBe("verse");
    expect(plan.explain.startBar).toBe(9);
  });

  it("puts a one-shot accent on every section start", () => {
    const markers = [
      { kind: "verse", positionMs: Math.round(8 * barMs) },
      { kind: "hook", positionMs: Math.round(24 * barMs) },
    ];
    const plan = planSamplePlacement({
      sample: { type: "oneshot", bpm: null, key: "A2", bars: null, durationMs: 1500 },
      project: { ...project, markers },
      playheadMs: 0,
      scope: "song",
      canPitch: true,
    });
    expect(plan.starts).toEqual([0, Math.round(8 * barMs), Math.round(24 * barMs)]);
    expect(plan.stretch).toBe(1);
    expect(plan.pitchCents).toBe(0);
    expect(plan.gainDb).toBe(-3);
  });
});
