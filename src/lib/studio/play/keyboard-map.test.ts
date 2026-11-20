import { describe, expect, it } from "vitest";

import { chordIndexForCode, isBlackKey, isPlayKey, keyLabelForOffset, noteForCode, noteName, octaveShiftForCode, padForCode, shiftBaseNote } from "./keyboard-map";

describe("Graj keyboard map", () => {
  it("maps the home row to white keys and the row above to black keys", () => {
    expect(noteForCode("KeyA", 60)).toBe(60);
    expect(noteForCode("KeyW", 60)).toBe(61);
    expect(noteForCode("KeyD", 60)).toBe(64);
    expect(noteForCode("KeyK", 60)).toBe(72);
    expect(noteForCode("Quote", 60)).toBe(77);
    expect(noteForCode("KeyQ", 60)).toBeNull();
    expect(keyLabelForOffset(1)).toBe("W");
    expect(keyLabelForOffset(16)).toBe(";");
  });

  it("shifts octaves within range", () => {
    expect(octaveShiftForCode("KeyZ")).toBe(-1);
    expect(octaveShiftForCode("KeyX")).toBe(1);
    expect(shiftBaseNote(60, 1)).toBe(72);
    expect(shiftBaseNote(24, -1)).toBe(24);
    expect(shiftBaseNote(84, 1)).toBe(84);
  });

  it("maps pads and chords", () => {
    expect(padForCode("KeyQ")).toBe(0);
    expect(padForCode("KeyF")).toBe(7);
    expect(padForCode("KeyZ")).toBeNull();
    expect(padForCode("KeyZ", 16)).toBe(8);
    expect(chordIndexForCode("Digit3")).toBe(2);
    expect(chordIndexForCode("Digit9")).toBeNull();
    expect(isPlayKey("Space")).toBe(true);
    expect(isPlayKey("KeyB")).toBe(false);
  });

  it("names notes", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(69)).toBe("A4");
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(64)).toBe(false);
  });
});
