import { describe, expect, it } from "vitest";

import { keyForBrief, parseReferenceMeasure, resolveReferenceTempo } from "./reference-tempo";

describe("reference track tempo", () => {
  it("validates what the form echoes back", () => {
    expect(parseReferenceMeasure({ bpm: 90, sure: true, candidates: [90, 180, 45, "x"], key: "F#m" })).toEqual({
      bpm: 90,
      sure: true,
      candidates: [90, 180],
      key: "F#m",
    });
    expect(parseReferenceMeasure({ bpm: 300, sure: true, key: "H" })).toBeNull();
    expect(parseReferenceMeasure(null)).toBeNull();
  });

  it("trusts a sure measurement over Gemini", () => {
    expect(resolveReferenceTempo({ bpm: 82, sure: true, candidates: [82], key: null }, 164)).toBe(82);
  });

  it("uses Gemini only to choose among measured candidates", () => {
    const m = { bpm: 140, sure: false, candidates: [70, 140], key: null };
    expect(resolveReferenceTempo(m, 72)).toBe(70);
    expect(resolveReferenceTempo(m, 139)).toBe(140);
    expect(resolveReferenceTempo(m, 100)).toBe(140);
    expect(resolveReferenceTempo(null, 97)).toBe(97);
  });

  it("spells the key for the English brief", () => {
    expect(keyForBrief("Am")).toBe("A minor");
    expect(keyForBrief("F#")).toBe("F# major");
  });
});
