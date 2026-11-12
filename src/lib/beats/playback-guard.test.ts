import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decidePlaybackGuard, PLAYBACK_MAX_DISTINCT_BEATS_PER_HOUR, PLAYBACK_MAX_PER_HOUR } from "./playback-guard";

const NOW = Date.parse("2026-11-12T15:00:00Z");
const row = (beat: string, minAgo: number) => ({ beat_id: beat, created_at: new Date(NOW - minAgo * 60_000).toISOString() });

describe("full-file playback guard", () => {
  it("normal Studio use passes (same Bit reloaded many times)", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row("b1", i));
    expect(decidePlaybackGuard(rows, "b1", NOW)).toEqual({ allowed: true });
  });
  it("a scraper pulling many different Bits is stopped", () => {
    const rows = Array.from({ length: PLAYBACK_MAX_DISTINCT_BEATS_PER_HOUR }, (_, i) => row("b" + i, i));
    expect(decidePlaybackGuard(rows, "new", NOW)).toEqual({ allowed: false, reason: "distinct_beats" });
    expect(decidePlaybackGuard(rows, "b3", NOW)).toEqual({ allowed: true });
  });
  it("too many requests in an hour are stopped; old rows do not count", () => {
    const rows = Array.from({ length: PLAYBACK_MAX_PER_HOUR }, (_, i) => row("b1", i % 50));
    expect(decidePlaybackGuard(rows, "b1", NOW)).toEqual({ allowed: false, reason: "per_hour" });
    const old = Array.from({ length: PLAYBACK_MAX_PER_HOUR }, () => row("b1", 90));
    expect(decidePlaybackGuard(old, "b1", NOW)).toEqual({ allowed: true });
  });
  it("is wired only for signed-in USER playback of full files, with logging and a migration", () => {
    const src = readFileSync("src/lib/beats/audio-access.ts", "utf8");
    expect(src).toContain('params.purpose === "PLAYBACK" &&');
    expect(src).toContain("!shortListen &&");
    expect(src).toContain('actor === "USER" &&');
    expect(src).toContain("logFullPlayback(");
    expect(readFileSync("supabase/migrations/20261112150000_beat_audio_playback_log.sql", "utf8")).toContain("enable row level security");
  });
});
