import { describe, expect, it } from "vitest";

import { previousHalfYear, prizeConsent, resumeOpen, wholeDays } from "@/lib/catalog/catalog-prize";
import type { PlanSnapshot } from "@/lib/payments/entitlement-grant";

const NOW = new Date("2026-11-07T12:00:00.000Z");

function plan(partial: NonNullable<PlanSnapshot>): PlanSnapshot {
  return { active: true, pendingTier: null, pendingExpiresAt: null, ...partial };
}

describe("work half-year prize", () => {
  it("names the closed half before the open one", () => {
    expect(previousHalfYear(NOW).key).toBe("2026-H1");
    expect(previousHalfYear(new Date("2026-03-15T12:00:00.000Z")).key).toBe("2025-H2");
  });

  it("counts a partial day as one day", () => {
    expect(wholeDays(60 * 60 * 1000)).toBe(1);
    expect(wholeDays(10 * 24 * 60 * 60 * 1000)).toBe(10);
  });

  it("asks a free account only to turn the prize on", () => {
    expect(prizeConsent(null, null, NOW)).toEqual({ kind: "free" });
  });

  it("adds the prize year onto a live Gold end", () => {
    const until = new Date(NOW.getTime() + 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(prizeConsent(plan({ tier: "GOLD", expiresAt: until }), "purchase", NOW)).toEqual({
      kind: "gold",
      daysLeft: 40,
      until,
      queued: false,
    });
  });

  it("pauses Silver and keeps the day count", () => {
    const until = new Date(NOW.getTime() + 12 * 24 * 60 * 60 * 1000).toISOString();
    expect(prizeConsent(plan({ tier: "SILVER", expiresAt: until }), "purchase", NOW)).toMatchObject({
      kind: "pause",
      tier: "SILVER",
      daysLeft: 12,
      queued: false,
    });
  });

  it("does not move a plan that has no end", () => {
    expect(prizeConsent(plan({ tier: "GOLD", expiresAt: null }), "manual_admin", NOW).kind).toBe("perpetual");
  });

  it("waits while GOLD(N) is still running", () => {
    const until = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(prizeConsent(plan({ tier: "GOLD", expiresAt: until }), "work_prize", NOW).kind).toBe("already");
    expect(resumeOpen(plan({ tier: "GOLD", expiresAt: until }), NOW)).toBe(false);
    expect(resumeOpen(null, NOW)).toBe(true);
  });
});
