import { describe, expect, it } from "vitest";

import {
  LYRICS_LIMITS,
  LyricsValidationError,
  lyricsFocus,
  lyricsFromText,
  lyricsToText,
  parseLyricsDocForWrite,
  readLyricsDoc,
  setLyricsSectionStart,
} from "./lyrics";

let n = 0;
const createId = () => `s${++n}`;

describe("lyricsFromText / lyricsToText", () => {
  it("parses headers into sections and round-trips", () => {
    const doc = lyricsFromText("[Zwrotka 1]\nraz\ndwa\n\n[Refren]\nhook", undefined, { createId });
    expect(doc.sections.map((s) => [s.label, s.lines])).toEqual([
      ["Zwrotka 1", ["raz", "dwa"]],
      ["Refren", ["hook"]],
    ]);
    expect(lyricsFromText(lyricsToText(doc), doc).sections).toEqual(doc.sections);
  });
  it("text before the first header goes to a default section", () => {
    const doc = lyricsFromText("\nluźna linijka\n[Refren]\nx", undefined, { createId, defaultLabel: "Tekst" });
    expect(doc.sections[0]).toMatchObject({ label: "Tekst", lines: ["luźna linijka"] });
  });
  it("keeps anchors and ids by label when sections move or lines change", () => {
    let doc = lyricsFromText("[A]\n1\n[B]\n2", undefined, { createId });
    doc = setLyricsSectionStart(doc, doc.sections[1].id, 8000);
    const next = lyricsFromText("[B]\n2 zmienione\n[A]\n1", doc);
    expect(next.sections[0]).toMatchObject({ label: "B", startMs: 8000, id: doc.sections[1].id });
    expect(next.sections[1].startMs).toBeNull();
  });
  it("keeps anchor on rename when the section count is unchanged", () => {
    let doc = lyricsFromText("[A]\n1", undefined, { createId });
    doc = setLyricsSectionStart(doc, doc.sections[0].id, 1200);
    expect(lyricsFromText("[Zwrotka]\n1", doc).sections[0].startMs).toBe(1200);
  });
  it("caps sections and line length", () => {
    const text = Array.from({ length: 50 }, (_, i) => `[S${i}]\n${"x".repeat(300)}`).join("\n");
    const doc = lyricsFromText(text, undefined, { createId });
    expect(doc.sections).toHaveLength(LYRICS_LIMITS.maxSections);
    expect(doc.sections[0].lines[0]).toHaveLength(LYRICS_LIMITS.maxLineChars);
  });
});

describe("parseLyricsDocForWrite", () => {
  it("accepts a valid doc and rounds anchors", () => {
    expect(
      parseLyricsDocForWrite({ sections: [{ id: "a1", label: "Refren", startMs: 10.6, lines: ["x"] }] }),
    ).toEqual({ sections: [{ id: "a1", label: "Refren", startMs: 11, lines: ["x"] }] });
  });
  it.each([
    [null],
    [{ sections: "x" }],
    [{ sections: [{ id: "bad id!", label: "A", startMs: null, lines: [] }] }],
    [{ sections: [{ id: "a", label: "", startMs: null, lines: [] }] }],
    [{ sections: [{ id: "a", label: "A", startMs: -1, lines: [] }] }],
    [{ sections: [{ id: "a", label: "A", startMs: null, lines: [1] }] }],
    [{ sections: [{ id: "a", label: "A", startMs: null, lines: [] }, { id: "a", label: "B", startMs: null, lines: [] }] }],
  ])("rejects %j", (raw) => {
    expect(() => parseLyricsDocForWrite(raw)).toThrow(LyricsValidationError);
  });
  it("rejects documents over the total size cap", () => {
    const sections = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      label: "A",
      startMs: null,
      lines: Array.from({ length: 2 }, () => "y".repeat(200)),
    }));
    expect(() => parseLyricsDocForWrite({ sections })).toThrow(/za długi/);
  });
  it("readLyricsDoc never throws", () => {
    expect(readLyricsDoc("garbage")).toEqual({ sections: [] });
  });
});

describe("lyricsFocus", () => {
  const doc = {
    sections: [
      { id: "v1", label: "Zwrotka", startMs: 0, lines: ["a", "b", "c"] },
      { id: "h", label: "Refren", startMs: 16000, lines: ["h1", "h2"] },
      { id: "x", label: "Bez kotwicy", startMs: null, lines: ["z"] },
    ],
  };
  it("single take follows the playhead", () => {
    expect(lyricsFocus({ doc, mode: "single", playheadMs: 17000 }).sectionId).toBe("h");
    expect(lyricsFocus({ doc, mode: "single", playheadMs: 5000 }).sectionId).toBe("v1");
  });
  it("loop uses the loop start, not the moving playhead", () => {
    expect(lyricsFocus({ doc, mode: "loop", playheadMs: 17000, loopStartMs: 4000 }).sectionId).toBe("v1");
  });
  it("punch-in highlights the punched line", () => {
    expect(lyricsFocus({ doc, mode: "punch", playheadMs: 0, loopStartMs: 16000, punchLine: 1 })).toEqual({
      sectionId: "h",
      lineIndex: 1,
      referenceMs: 16000,
    });
    expect(lyricsFocus({ doc, mode: "punch", playheadMs: 0, loopStartMs: 16000, punchLine: 9 }).lineIndex).toBeNull();
  });
  it("returns null before the first anchor", () => {
    const d = { sections: [{ id: "h", label: "R", startMs: 5000, lines: [] }] };
    expect(lyricsFocus({ doc: d, mode: "single", playheadMs: 100 }).sectionId).toBeNull();
  });
});
