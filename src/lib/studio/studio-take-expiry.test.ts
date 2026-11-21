import { describe, expect, it } from "vitest";

import { studioClipTakeIds, studioTakeExpiryNotice } from "@/lib/studio/studio-take-expiry";

const NOW = Date.parse("2026-11-22T10:00:00Z");
const H = 3_600_000;
const row = (id: string, offsetMs: number, extra: Partial<{ status: string; deletedAt: string | null }> = {}) => ({
  id,
  status: extra.status ?? "READY",
  deletedAt: extra.deletedAt ?? null,
  expiresAt: new Date(NOW + offsetMs).toISOString(),
});

describe("studioTakeExpiryNotice", () => {
  it("none without takes", () => {
    expect(studioTakeExpiryNotice([], [], NOW)).toEqual({ kind: "none" });
  });
  it("none when every take has more than 3 days", () => {
    expect(studioTakeExpiryNotice(["a"], [row("a", 10 * 24 * H)], NOW).kind).toBe("none");
  });
  it("soon with the earliest deadline and hours left", () => {
    const n = studioTakeExpiryNotice(["a", "b", "c"], [row("a", 50 * H), row("b", 5 * H), row("c", 30 * 24 * H)], NOW);
    expect(n).toEqual({ kind: "soon", count: 2, expiresAt: new Date(NOW + 5 * H).toISOString(), hoursLeft: 5 });
  });
  it("expired wins and counts missing, deleted and past takes once", () => {
    const n = studioTakeExpiryNotice(["a", "a", "b", "c", "d"], [row("a", -H), row("b", 5 * H, { deletedAt: "x" }), row("c", H)], NOW);
    expect(n).toEqual({ kind: "expired", count: 3 });
  });
  it("only TAKE clips are recordings", () => {
    expect(
      studioClipTakeIds([
        { sourceKind: "TAKE", sourceTakeId: "t1" },
        { sourceKind: "ARTIFACT", sourceTakeId: "t2" },
        { sourceKind: "BEAT_REF", sourceTakeId: null },
      ]),
    ).toEqual(["t1"]);
  });
});
