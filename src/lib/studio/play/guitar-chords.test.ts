import { describe, expect, it } from "vitest";

import { DEFAULT_CHORD_SET, chordNotes, findChord, pluckNote, strum, strumSpacingMs, strumVelocity } from "./guitar-chords";

describe("guitar chords", () => {
  it("voices chords on standard tuning", () => {
    expect(chordNotes(findChord("Am")!)).toEqual([null, 45, 52, 57, 60, 64]);
    expect(chordNotes(findChord("E")!)).toEqual([40, 47, 52, 56, 59, 64]);
    for (const id of DEFAULT_CHORD_SET) expect(findChord(id)).not.toBeNull();
  });

  it("strums low to high going down and high to low going up, skipping muted strings", () => {
    const am = findChord("Am")!;
    const down = strum(am, "down", 0.5);
    expect(down.map((h) => h.note)).toEqual([45, 52, 57, 60, 64]);
    expect(down[1]!.offsetMs).toBe(strumSpacingMs(0.5));
    const up = strum(am, "up", 0.5);
    expect(up.map((h) => h.note)).toEqual([64, 60, 57, 52, 45]);
    expect(up[0]!.velocity).toBeLessThan(down[0]!.velocity);
    expect(strum(am, "down", 1, [0, 1, 2]).map((h) => h.string)).toEqual([1, 2]);
  });

  it("fast strums are tighter and louder", () => {
    expect(strumSpacingMs(0)).toBe(35);
    expect(strumSpacingMs(5)).toBe(8);
    expect(strumVelocity(2)).toBe(1);
    expect(strumVelocity(0)).toBeCloseTo(0.35);
    expect(pluckNote(findChord("Am")!, 0)).toBe(40);
  });
});
