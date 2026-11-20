import { describe, expect, it } from "vitest";

import { pickZone, swingBeat } from "./instrument-engine";
import type { PlaySession } from "./play-types";
import { buildSchedule, foldTail, loopSeconds, mainInstrument, sampleInstrumentFor, sampleKindFor } from "./render-session";

const session: PlaySession = {
  bpm: 90,
  bars: 1,
  key: "Am",
  swing: 0,
  layers: [
    { id: "a", instrument: "piano", gain: 1, notes: [{ t: 0, d: 1, n: 57, v: 0.8 }, { t: 2, d: 1, n: 60, v: 0.5 }] },
    { id: "b", instrument: "hiphop", gain: 0.9, notes: [{ t: 0, d: 0.25, n: 0, v: 1 }, { t: 0.25, d: 0.25, n: 3, v: 0.6 }, { t: 4, d: 0.25, n: 1, v: 1 }] },
    { id: "c", instrument: "synth-pad", gain: 1, muted: true, notes: [{ t: 0, d: 4, n: 45, v: 0.7 }] },
  ],
};

describe("render schedule", () => {
  it("lists notes in seconds, drops muted layers and notes past the loop", () => {
    const s = buildSchedule(session);
    expect(s.map((e) => e.instrument)).toEqual(["piano", "hiphop", "hiphop", "piano"]);
    expect(s[3]!.time).toBeCloseTo((2 * 60) / 90, 6);
    expect(s[0]!.dur).toBeCloseTo(60 / 90, 6);
    expect(loopSeconds(session)).toBeCloseTo((4 * 60) / 90, 6);
  });

  it("swings odd sixteenths only", () => {
    expect(swingBeat(0.25, 0.4)).toBeCloseTo(0.3, 6);
    expect(swingBeat(0.5, 0.4)).toBe(0.5);
    expect(swingBeat(0.33, 0.4)).toBe(0.33);
    const swung = buildSchedule({ ...session, swing: 0.4 });
    expect(swung[2]!.time).toBeCloseTo((0.3 * 60) / 90, 6);
  });

  it("folds the ring-out onto the start of the loop", () => {
    const ch = new Float32Array([1, 0, 0, 0, 0.5, 0.25]);
    expect(Array.from(foldTail([ch], 4)[0]!)).toEqual([1.5, 0.25, 0, 0]);
  });

  it("names the sample after the busiest layer", () => {
    expect(mainInstrument(session)).toBe("hiphop");
    expect(sampleInstrumentFor("epiano")).toBe("keys");
    expect(sampleInstrumentFor("hiphop")).toBe("drums");
    expect(sampleKindFor("drums")).toBe("effect");
    expect(sampleKindFor("guitar")).toBe("instrument");
  });

  it("picks the zone that holds the note and the hard layer for loud notes", () => {
    const zones = [
      { file: "a", center: 57, lo: 55, hi: 58, vel: "soft" as const },
      { file: "b", center: 57, lo: 55, hi: 58, vel: "hard" as const },
      { file: "c", center: 60, lo: 59, hi: 61, vel: "soft" as const },
    ];
    expect(pickZone(zones, 56, 0.9)!.file).toBe("b");
    expect(pickZone(zones, 56, 0.3)!.file).toBe("a");
    expect(pickZone(zones, 70, 0.9)!.file).toBe("c");
  });
});
