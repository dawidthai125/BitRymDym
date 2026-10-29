import { describe, expect, it } from "vitest";

import { canCreateStudioProject, masterQuotaLeft, monthlyMasterLimit, StudioProjectLimitError, warsawMonthWindow } from "./studio-plan-limits";

describe("Studio plan limits", () => {
  it("project cap per plan; above-cap accounts keep projects but cannot create", () => {
    expect(canCreateStudioProject({ tier: "FREE", activeProjects: 2 })).toBe(true);
    expect(canCreateStudioProject({ tier: "FREE", activeProjects: 3 })).toBe(false);
    expect(canCreateStudioProject({ tier: "FREE", activeProjects: 12 })).toBe(false);
    expect(canCreateStudioProject({ tier: "BRONZE", activeProjects: 9 })).toBe(true);
    expect(canCreateStudioProject({ tier: "SILVER", activeProjects: 25 })).toBe(false);
    expect(canCreateStudioProject({ tier: "GOLD", activeProjects: 49 })).toBe(true);
    expect(canCreateStudioProject({ tier: "GOLD", activeProjects: Number.NaN })).toBe(true);
    const e = new StudioProjectLimitError("FREE", 3);
    expect(e.code).toBe("PROJECT_LIMIT_REACHED");
    expect(e.limit).toBe(3);
  });

  it("master quota per month", () => {
    expect(monthlyMasterLimit("FREE")).toBe(8);
    expect(monthlyMasterLimit("GOLD")).toBe(200);
    expect(masterQuotaLeft({ used: 9, monthLimit: 8, resetAt: "" })).toBe(0);
    expect(masterQuotaLeft({ used: 3, monthLimit: 8, resetAt: "" })).toBe(5);
  });

  it("month window follows Europe/Warsaw (CET and CEST)", () => {
    // 31 Oct 23:30 UTC = 1 Nov 00:30 Warsaw (CET) → November.
    expect(warsawMonthWindow(new Date("2026-10-31T23:30:00Z"))).toEqual({ startIso: "2026-10-31T23:00:00.000Z", resetIso: "2026-11-30T23:00:00.000Z" });
    // 15 Oct (CEST) → October started 30 Sep 22:00 UTC, November starts 31 Oct 23:00 UTC (CET).
    expect(warsawMonthWindow(new Date("2026-10-15T12:00:00Z"))).toEqual({ startIso: "2026-09-30T22:00:00.000Z", resetIso: "2026-10-31T23:00:00.000Z" });
    // December → January next year.
    expect(warsawMonthWindow(new Date("2026-12-10T12:00:00Z")).resetIso).toBe("2026-12-31T23:00:00.000Z");
  });
});
