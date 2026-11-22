import { describe, expect, it } from "vitest";

import {
  UNPLACED_TAKE_MEMO_TTL_MS,
  clearUnplacedTakeMemo,
  parseUnplacedTakeMemo,
  readUnplacedTakeMemo,
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
