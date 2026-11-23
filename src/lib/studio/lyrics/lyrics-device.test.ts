import { describe, expect, it } from "vitest";

import { lyricsFromText } from "@/lib/studio/lyrics/lyrics";
import { clearLyricsDirty, readLyricsCopy, unsavedLyricsCopy, writeLyricsCopy } from "@/lib/studio/lyrics/lyrics-device";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const doc = lyricsFromText("[Zwrotka 1]\nostatni wers", { sections: [] }, { defaultLabel: "Tekst" });

describe("lyrics device copy", () => {
  it("keeps text typed just before leaving the card", () => {
    const s = mem();
    writeLyricsCopy("p", doc, 3, s);
    expect(unsavedLyricsCopy("p", 3, s)).toEqual(readLyricsCopy("p", s));
    expect(unsavedLyricsCopy("p", 4, s)).toBeNull();
  });
  it("does not beat the server once the text is confirmed", () => {
    const s = mem();
    writeLyricsCopy("p", doc, 3, s);
    clearLyricsDirty("p", s);
    expect(unsavedLyricsCopy("p", 3, s)).toBeNull();
    writeLyricsCopy("p", doc, 5, s);
    writeLyricsCopy("p", doc, null, s);
    expect(unsavedLyricsCopy("p", 5, s)).toBeNull();
  });
  it("still offers an old offline copy when the server has nothing", () => {
    const s = mem();
    s.setItem("brd:lyrics:p", JSON.stringify(doc));
    expect(unsavedLyricsCopy("p", 0, s)?.sections.length).toBe(1);
    expect(unsavedLyricsCopy("p", 1, s)).toBeNull();
  });
});
