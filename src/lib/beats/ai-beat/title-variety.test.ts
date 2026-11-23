import { describe, expect, it } from "vitest";

import { parseTitleCandidates, pickDistinctTitle, titleRejectReason, titleWords } from "@/lib/beats/ai-beat/title-variety";

const existing = ["Mroczny Puls w Moll", "Mroczny Motyw Ulicy", "Komitywa II (remix)", "Szare Blokowisko", "Dym i Neon", "Stare Aleje"];

describe("title variety", () => {
  it("extracts content words", () => {
    expect(titleWords("Komitywa II (remix)")).toEqual(["komitywa", "ii"]);
    expect(titleWords("Dym i Neon")).toEqual(["dym", "neon"]);
  });
  it("rejects clones and overused words", () => {
    expect(titleRejectReason("Mroczny Bas w Moll", existing)).toBe("overused word");
    expect(titleRejectReason("Ciemny Motyw Ulicy", existing)).toBe("overused word");
    expect(titleRejectReason("Szare Podwórko", existing)).toMatch(/same first word/);
    expect(titleRejectReason("Neon i Dym", existing)).toMatch(/too close|same first/);
    expect(titleRejectReason("Ostatni tramwaj", existing)).toBeNull();
    expect(titleRejectReason("Klatka B", existing)).toBeNull();
  });
  it("picks the first distinct candidate", () => {
    expect(pickDistinctTitle(["Mroczny Rytm", "„Stare Aleje”", "Szron na szybie"], existing)).toBe("Szron na szybie");
    expect(pickDistinctTitle(["Nocny Kurs"], existing)).toBeNull();
  });
  it("parses model output", () => {
    expect(parseTitleCandidates('{"titles":["A","B",3]}')).toEqual(["A", "B"]);
    expect(parseTitleCandidates("nope")).toEqual([]);
  });
});
