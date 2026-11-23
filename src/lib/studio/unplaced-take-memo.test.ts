import { describe, expect, it } from "vitest";

import {
  TAKE_PLACEMENT_LIMIT,
  UNPLACED_TAKE_MEMO_TTL_MS,
  adoptRecoveredTake,
  clearUnplacedTakeMemo,
  clipDurationCapMs,
  parseTakePlacements,
  parseUnplacedTakeMemo,
  readTakePlacement,
  readUnplacedTakeMemo,
  rememberTakePlacement,
  writePendingPlacement,
  writeUnplacedTakeMemo,
} from "@/lib/studio/unplaced-take-memo";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const TAKE = "11111111-2222-4333-8444-555555555555";

describe("unplaced take memo (reload before Zachowaj)", () => {
  it("round-trips per project and clears only the matching take", () => {
    const s = memStore();
    writeUnplacedTakeMemo("p1", { takeId: TAKE, trackId: "t1", startMs: 1234.4, durationSeconds: 18 }, s);
    expect(readUnplacedTakeMemo("p1", s)).toMatchObject({ takeId: TAKE, trackId: "t1", startMs: 1234, durationSeconds: 18 });
    expect(readUnplacedTakeMemo("p2", s)).toBeNull();
    clearUnplacedTakeMemo("p1", "99999999-2222-4333-8444-555555555555", s);
    expect(readUnplacedTakeMemo("p1", s)).not.toBeNull();
    clearUnplacedTakeMemo("p1", TAKE, s);
    expect(readUnplacedTakeMemo("p1", s)).toBeNull();
  });

  it("rejects stale, malformed or foreign values", () => {
    const now = Date.now();
    const ok = { takeId: TAKE, trackId: "t1", startMs: 0, durationSeconds: null, savedAt: now };
    expect(parseUnplacedTakeMemo(JSON.stringify(ok), now)).not.toBeNull();
    expect(parseUnplacedTakeMemo(JSON.stringify({ ...ok, savedAt: now - UNPLACED_TAKE_MEMO_TTL_MS - 1 }), now)).toBeNull();
    expect(parseUnplacedTakeMemo(JSON.stringify({ ...ok, takeId: "x" }), now)).toBeNull();
    expect(parseUnplacedTakeMemo(JSON.stringify({ ...ok, startMs: -1 }), now)).toBeNull();
    expect(parseUnplacedTakeMemo("{bad", now)).toBeNull();
  });
});

describe("take placements (list puts a take back where it was recorded)", () => {
  const T2 = "22222222-2222-4333-8444-555555555555";

  it("remembers track, start and latency correction per take", () => {
    const s = memStore();
    rememberTakePlacement("p1", { takeId: TAKE, trackId: "t1", timelineStartMs: 2050, sourceOffsetMs: 392 }, s);
    rememberTakePlacement("p1", { takeId: T2, trackId: "t2", timelineStartMs: 0, sourceOffsetMs: 0 }, s);
    expect(readTakePlacement("p1", TAKE, s)).toMatchObject({ trackId: "t1", timelineStartMs: 2050, sourceOffsetMs: 392 });
    expect(readTakePlacement("p1", T2, s)).toMatchObject({ trackId: "t2" });
    expect(readTakePlacement("p2", TAKE, s)).toBeNull();
  });

  it("keeps the newest takes only and drops broken rows", () => {
    const s = memStore();
    for (let i = 0; i < TAKE_PLACEMENT_LIMIT + 5; i += 1) {
      rememberTakePlacement("p", { takeId: `${String(i).padStart(8, "0")}-2222-4333-8444-555555555555`, trackId: "t", timelineStartMs: i, sourceOffsetMs: 0 }, s);
    }
    expect(readTakePlacement("p", "00000000-2222-4333-8444-555555555555", s)).toBeNull();
    expect(readTakePlacement("p", `${String(TAKE_PLACEMENT_LIMIT + 4).padStart(8, "0")}-2222-4333-8444-555555555555`, s)).not.toBeNull();
    expect(parseTakePlacements("{bad")).toEqual([]);
    expect(parseTakePlacements(JSON.stringify([{ takeId: "x" }, null]))).toEqual([]);
  });

  it("the banner memo carries the latency correction", () => {
    const s = memStore();
    writeUnplacedTakeMemo("p1", { takeId: TAKE, trackId: "t1", startMs: 10_000, sourceOffsetMs: 92, durationSeconds: 5 }, s);
    expect(readUnplacedTakeMemo("p1", s)).toMatchObject({ startMs: 10_000, sourceOffsetMs: 92 });
  });

  it("a recovered local copy gets its place back once", () => {
    const s = memStore();
    writePendingPlacement("p1", { trackId: "t1", timelineStartMs: 4000, sourceOffsetMs: 350 }, s);
    expect(adoptRecoveredTake("p1", TAKE, s)).toBe(true);
    expect(readTakePlacement("p1", TAKE, s)).toMatchObject({ timelineStartMs: 4000, sourceOffsetMs: 350 });
    expect(readUnplacedTakeMemo("p1", s)).toMatchObject({ takeId: TAKE, startMs: 4000 });
    expect(adoptRecoveredTake("p1", T2, s)).toBe(false);
  });

  it("caps the clip length only when the take runs past the timeline", () => {
    const base = { sourceOffsetMs: 0, takeDurationSeconds: 10, timelineLengthMs: 60_000 };
    expect(clipDurationCapMs({ ...base, timelineStartMs: 0 })).toBeUndefined();
    expect(clipDurationCapMs({ ...base, timelineStartMs: 55_000 })).toBe(5000);
    expect(clipDurationCapMs({ ...base, timelineStartMs: 55_000, takeDurationSeconds: null })).toBeUndefined();
  });
});
