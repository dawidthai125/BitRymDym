import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("rhyme dictionary", async () => {
  const { findRhymes, rhymePageWords, hasRhymePage, rhymePagePath, rhymeCountLabel } = await import("@/lib/rymy/dictionary");

  it("uses Polish plurals", () => {
    expect([1, 3, 5, 12, 22, 33, 114].map(rhymeCountLabel)).toEqual(["1 rym", "3 rymy", "5 rymów", "12 rymów", "22 rymy", "33 rymy", "114 rymów"]);
  });

  it("finds common Polish rhymes", () => {
    const r = findRhymes("ulica")!;
    expect([...r.multi, ...r.exact]).toEqual(expect.arrayContaining(["granica"]));
    expect(findRhymes("noga")!.exact).toEqual(expect.arrayContaining(["droga"]));
    const love = findRhymes("miłość")!;
    expect(love.near).toEqual(expect.arrayContaining(["czułość"]));
  });

  it("skips the word itself and tautological rhymes", () => {
    const r = findRhymes("robić")!;
    const all = [...r.multi, ...r.exact, ...r.near];
    expect(all).not.toContain("robić");
    expect(all).not.toContain("zrobić");
  });

  it("rejects non-words", () => {
    expect(findRhymes("abc123")).toBeNull();
    expect(findRhymes("")).toBeNull();
  });

  it("has ~1500 indexable pages, unique, with encoded paths", () => {
    const pages = rhymePageWords();
    expect(pages.length).toBeGreaterThan(2500);
    expect(hasRhymePage("ulica")).toBe(true);
    expect(hasRhymePage("rap")).toBe(true);
    expect(hasRhymePage("kasa")).toBe(true);
    expect(new Set(pages).size).toBe(pages.length);
    expect(hasRhymePage("życie")).toBe(true);
    expect(rhymePagePath("życie")).toBe("/rymy/%C5%BCycie");
    for (const w of pages) expect(w).not.toMatch(/kurw|jeb|pierdol|chuj/);
  });
});
