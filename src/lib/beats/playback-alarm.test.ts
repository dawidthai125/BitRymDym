import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { alarmMail, distinctBeats, SCRAPE_DISTINCT_BEATS_PER_DAY } from "@/lib/beats/playback-alarm";

describe("playback scraping alarm", () => {
  it("counts different beats, not plays", () => {
    expect(distinctBeats([{ beat_id: "a" }, { beat_id: "a" }, { beat_id: "b" }])).toBe(2);
    expect(SCRAPE_DISTINCT_BEATS_PER_DAY).toBe(20);
  });

  it("mail names the account and links the admin page, no e-mail address", () => {
    const m = alarmMail({ kind: "beat_scraping", userNumber: 42, name: "Ziomek", beats: 23, adminUrl: "https://www.bitrymdym.pl/admin/users/u1" });
    expect(m.subject).toContain("Ziomek (nr 42)");
    expect(m.text).toContain("23 różnych bitów w ciągu 24 godzin");
    expect(m.text).toContain("/admin/users/u1");
    expect(m.text).not.toMatch(/@/);
    expect(alarmMail({ kind: "playback_limit", userNumber: null, name: null, beats: 12, adminUrl: "x" }).text).toContain("godzinny limit");
  });
});
