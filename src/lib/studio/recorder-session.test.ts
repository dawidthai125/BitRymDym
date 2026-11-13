import { describe, expect, it } from "vitest";

import {
  OFFLINE_EXTRAS,
  OFFLINE_VOCALS,
  SITE_GOLD_TRACKS,
  clockText,
  panText,
  parseRecorderSession,
  sessionChecklist,
} from "@/lib/studio/recorder-session";

const sample = {
  format: "bitrymdym.sesja",
  version: 1,
  savedAt: "2026-11-13T12:00:00+01:00",
  title: "Nocny szkic",
  rights: { beatChecked: false, vocalsChecked: false, note: "Program nie sprawdza licencji." },
  beat: {
    source: "file",
    fileName: "C:\\Users\\ktoś\\Pulpit\\moj bit.mp3",
    durationSeconds: 95.2,
    gainDb: 3,
    muted: false,
    included: false,
  },
  stemAlign: "from-zero",
  tracks: [
    {
      order: 1,
      role: "wokal",
      name: "Wokal 1",
      gainDb: 2,
      pan: -0.4,
      muted: false,
      solo: false,
      stem: "Nocny-szkic_01_Wokal-1.wav",
      clips: [{ start: 12.5, end: 20.5, in: 0.2, out: 8.2 }],
    },
    {
      order: 2,
      role: "podbicie",
      name: "Adlib",
      gainDb: 0,
      pan: 1,
      muted: false,
      solo: false,
      stem: "Nocny-szkic_02_Adlib.wav",
      clips: [{ start: 40, in: 0, out: 2 }],
    },
    { order: 3, role: "wokal", name: "Pusta", clips: [] },
  ],
};

describe("parseRecorderSession", () => {
  it("keeps order, axis, level and pan, and drops the beat path", () => {
    const session = parseRecorderSession(sample);
    expect(session).not.toBeNull();
    expect(session?.beatFileName).toBe("moj bit.mp3");
    expect(session?.tracks).toHaveLength(2);
    expect(session?.tracks[0]).toMatchObject({ order: 1, role: "wokal", pan: -0.4, gainDb: 2 });
    expect(session?.tracks[1]).toMatchObject({ order: 2, role: "podbicie", pan: 1 });
    expect(session?.tracks[0]?.clips[0]?.start).toBe(12.5);
    expect(JSON.stringify(session)).not.toContain("Pulpit");
  });

  it("rejects a beat stuffed into the file and a foreign format", () => {
    expect(parseRecorderSession({ ...sample, beat: { ...sample.beat, included: true } })).toBeNull();
    expect(parseRecorderSession({ ...sample, audioBase64: "aaaa" })).toBeNull();
    expect(parseRecorderSession({ format: "inne", version: 1 })).toBeNull();
  });

  it("writes a checklist an artist can follow in the studio", () => {
    const session = parseRecorderSession(sample);
    expect(session).not.toBeNull();
    const lines = sessionChecklist(session!);
    expect(lines[0]).toContain("moj bit.mp3");
    expect(lines[1]).toContain("lewo 40");
    expect(lines[2]).toContain("prawo 100");
    expect(panText(0)).toBe("środek");
    expect(clockText(62.5)).toBe("1:02.50");
    expect(OFFLINE_VOCALS + OFFLINE_EXTRAS).toBe(24);
    expect(SITE_GOLD_TRACKS).toBe(16);
  });
});
