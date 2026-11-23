import { describe, expect, it } from "vitest";

import { normalizeStudioProjectTitle } from "@/lib/studio/studio-project-title";

describe("normalizeStudioProjectTitle", () => {
  it("trims and joins lines", () => {
    expect(normalizeStudioProjectTitle("  Mój \n kawałek ")).toBe("Mój kawałek");
  });
  it("refuses empty, non-text and too long titles", () => {
    expect(() => normalizeStudioProjectTitle("   ")).toThrow("Wpisz nazwę projektu.");
    expect(() => normalizeStudioProjectTitle(7)).toThrow("Wpisz nazwę projektu.");
    expect(() => normalizeStudioProjectTitle("a".repeat(121))).toThrow("120");
    expect(normalizeStudioProjectTitle("a".repeat(120))).toHaveLength(120);
  });
});
