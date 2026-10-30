import { describe, expect, it } from "vitest";

import { PLAN_POLICY } from "@/config/plan-policy";
import { buildPlanUsage, isPlanItemExhausted, nextUtcMidnightIso } from "@/lib/plans/plan-usage-model";

const counts = { beatDownloadsToday: 0, studioExportsWeek: 0, activeProjects: 2, takesToday: 1, activeReadyTakes: 1, mastersMonth: 3 };
const now = new Date("2026-10-29T21:30:00.000Z");

describe("plan usage model (header badge)", () => {
  it("Free: beat downloads and studio files locked; limits from plan-policy", () => {
    const u = buildPlanUsage({ tier: "FREE", counts, monthResetAt: "2026-10-31T23:00:00.000Z", now });
    const by = Object.fromEntries(u.items.map((i) => [i.id, i]));
    expect(by.beatDownloads).toMatchObject({ limit: 0, locked: true, resetAt: null });
    expect(by.studioExports).toMatchObject({ limit: 0, locked: true });
    expect(by.projects).toMatchObject({ used: 2, limit: PLAN_POLICY.FREE.studio.maxProjects });
    expect(by.recordingsToday).toMatchObject({ used: 1, limit: 1, resetAt: "2026-10-30T00:00:00.000Z" });
    expect(by.tracks).toMatchObject({ used: null, limit: 1, period: "perProject" });
    expect(isPlanItemExhausted(by.recordingsToday!)).toBe(true);
    expect(isPlanItemExhausted(by.beatDownloads!)).toBe(false);
  });

  it("Gold: downloads open, files without cap, 7 recording tracks", () => {
    const u = buildPlanUsage({ tier: "GOLD", counts, monthResetAt: "x", now });
    const by = Object.fromEntries(u.items.map((i) => [i.id, i]));
    expect(by.beatDownloads).toMatchObject({ limit: 50, locked: false });
    expect(by.studioExports).toMatchObject({ limit: null, locked: false });
    expect(by.tracks!.limit).toBe(7);
    expect(by.masters).toMatchObject({ used: 3, limit: 200, resetAt: "x" });
  });

  it("next UTC midnight", () => {
    expect(nextUtcMidnightIso(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});
