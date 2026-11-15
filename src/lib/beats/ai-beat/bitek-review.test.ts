import { describe, expect, it } from "vitest";

import {
  BITEK_REVIEW_SYSTEM,
  bitekFactsLines,
  nearestBeatDuration,
  revisionDescription,
  sliceBitekMessages,
} from "@/lib/beats/ai-beat/bitek-review";
import { normalizeBeatDescription } from "@/lib/beats/ai-beat/prompt";

describe("Bitek review facts", () => {
  it("cites only the stored title, style, description, tempo and length", () => {
    expect(BITEK_REVIEW_SYSTEM).toContain("Nie twierdzisz, że słyszysz");
    const lines = bitekFactsLines({
      title: "  Mroczny   puls ",
      style: "piano 808",
      opis: "Wolny bit.",
      bpm: 86,
      durationSeconds: 151.2,
    });
    expect(lines).toEqual([
      "Tytuł: Mroczny puls",
      "Styl: piano 808",
      "Opis: Wolny bit.",
      "Tempo: 86 BPM.",
      "Długość: 151 s.",
      "Głośność: niezmierzona.",
      "Nagranie: nie sprawdzono, czy jest puste.",
    ]);
  });

  it("says when a fact was not stored", () => {
    const lines = bitekFactsLines({
      title: "",
      style: null,
      opis: "  ",
      bpm: null,
      durationSeconds: 0,
    });
    expect(lines[0]).toBe("Tytuł: Bit");
    expect(lines[1]).toContain("brak zapisanego stylu");
    expect(lines[3]).toContain("niezmierzony");
    expect(lines[4]).toContain("nieznana");
    expect(lines[5]).toContain("niezmierzona");
  });

  it("keeps the last eight turns and drops empty ones", () => {
    const raw: Array<{ role: string; content: string }> = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `  wiadomość ${index} `,
    }));
    raw.push({ role: "system", content: "ukryte" });
    raw.push({ role: "user", content: "   " });
    const turns = sliceBitekMessages(raw);
    expect(turns).toHaveLength(8);
    expect(turns[0]?.content).toBe("wiadomość 2");
    expect(turns[7]?.content).toBe("wiadomość 9");
  });

  it("appends the fix note and snaps the length to a generator choice", () => {
    expect(revisionDescription("Wolny bit na noc.", "")).toBeNull();
    const next = revisionDescription("Wolny bit na noc.", "  wolniej i mniej pianina ");
    expect(next).toBe("Wolny bit na noc. Poprawka: wolniej i mniej pianina");
    expect(normalizeBeatDescription(next)).toBe(next);
    const long = revisionDescription("a".repeat(790), "b".repeat(50));
    expect(long?.length).toBe(800);
    expect(nearestBeatDuration(null)).toBe(150);
    expect(nearestBeatDuration(100)).toBe(90);
    expect(nearestBeatDuration(130)).toBe(120);
    expect(nearestBeatDuration(140)).toBe(150);
    expect(nearestBeatDuration(1000)).toBe(180);
  });
});
