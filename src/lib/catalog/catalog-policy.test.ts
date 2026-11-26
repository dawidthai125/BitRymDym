import { describe, expect, it } from "vitest";

import { warsawPeriod } from "@/lib/community/ranking-policy";
import {
  cleanWorkTitle,
  normalizeWorkConsents,
  projectPublishBlocked,
  warsawHalfYear,
  workWindow,
  type ProjectWorkVersion,
} from "@/lib/catalog/catalog-policy";

const OLD = "00000000-0000-4000-8000-000000000001";
const NEW = "00000000-0000-4000-8000-000000000002";
const v = (masterJobId: string, checkStatus: string | null, withdrawnAt: string | null = null, staffAt: string | null = null): ProjectWorkVersion => ({
  masterJobId,
  checkStatus,
  withdrawnAt,
  staffAt,
});

describe("project takedown blocks every master of the project", () => {
  it("does not block a project nobody took down", () => {
    expect(projectPublishBlocked([], NEW)).toBe(false);
    expect(projectPublishBlocked([v(OLD, "held", "2026-11-26T10:00:00Z"), v(OLD, "cancelled")], NEW)).toBe(false);
  });

  it("blocks a new master after the old one was rejected or removed", () => {
    for (const status of ["rejected", "removed"]) {
      const old = v(OLD, status, "2026-11-26T10:00:00Z", "2026-11-26T10:00:00Z");
      expect(projectPublishBlocked([old], NEW)).toBe(true);
      expect(projectPublishBlocked([old, v(NEW, "pending", "2026-11-26T11:00:00Z")], NEW)).toBe(true);
      expect(projectPublishBlocked([old, v(NEW, "cancelled", "2026-11-26T11:00:00Z")], NEW)).toBe(true);
      expect(projectPublishBlocked([old, v(NEW, "held", "2026-11-26T11:00:00Z")], NEW)).toBe(true);
    }
  });

  it("blocks the taken-down master itself", () => {
    expect(projectPublishBlocked([v(OLD, "rejected", "2026-11-26T10:00:00Z", "2026-11-26T10:00:00Z")], OLD)).toBe(true);
  });

  it("blocks republishing a version withdrawn before or after the takedown", () => {
    const old = v(OLD, "removed", "2026-11-26T10:00:00Z", "2026-11-26T10:00:00Z");
    expect(projectPublishBlocked([old, v(NEW, "passed", "2026-11-26T12:00:00Z")], NEW)).toBe(true);
    expect(projectPublishBlocked([old, v(NEW, "passed", "2026-11-26T12:00:00Z", "2026-11-26T09:00:00Z")], NEW)).toBe(true);
  });

  it("keeps a version staff let in after the takedown, and a version still live", () => {
    const old = v(OLD, "rejected", "2026-11-26T10:00:00Z", "2026-11-26T10:00:00Z");
    expect(projectPublishBlocked([old, v(NEW, "passed", null, "2026-11-26T12:00:00Z")], NEW)).toBe(false);
    expect(projectPublishBlocked([old, v(NEW, "passed", "2026-11-26T13:00:00Z", "2026-11-26T12:00:00Z")], NEW)).toBe(false);
    expect(projectPublishBlocked([old, v(NEW, "passed")], NEW)).toBe(false);
  });

  it("treats a takedown without a time as the newest decision", () => {
    const old = v(OLD, "removed", "2026-11-26T10:00:00Z", null);
    expect(projectPublishBlocked([old, v(NEW, "passed", "2026-11-26T13:00:00Z", "2026-11-26T12:00:00Z")], NEW)).toBe(true);
  });
});

const NOW = new Date("2026-11-07T12:00:00.000Z");

describe("finished-track consents", () => {
  it("forces ratings and comments when the track enters the prize boards", () => {
    expect(normalizeWorkConsents({ allowRatings: false, allowComments: false, inRankings: true })).toEqual({
      allowRatings: true,
      allowComments: true,
      inRankings: true,
    });
  });

  it("leaves catalogue-only consents optional, including neither", () => {
    expect(normalizeWorkConsents({ allowRatings: false, allowComments: true, inRankings: false })).toEqual({
      allowRatings: false,
      allowComments: true,
      inRankings: false,
    });
    expect(normalizeWorkConsents({ allowRatings: false, allowComments: false, inRankings: false })).toEqual({
      allowRatings: false,
      allowComments: false,
      inRankings: false,
    });
  });

  it("keeps a title between 1 and 80 characters", () => {
    expect(cleanWorkTitle("  Nocna  taśma  ")).toBe("Nocna taśma");
    expect(cleanWorkTitle("")).toBeNull();
    expect(cleanWorkTitle("a".repeat(81))).toBeNull();
  });
});

describe("finished-track periods", () => {
  it("uses the same Warsaw week and an open overall window", () => {
    const week = workWindow(NOW, "week");
    expect(week.key).toBe(warsawPeriod(NOW, "week").key);
    expect(week.start.toISOString()).toBe(warsawPeriod(NOW, "week").start.toISOString());
    const all = workWindow(NOW, "all");
    expect(all.key).toBe("all");
    expect(all.start.getTime()).toBe(0);
    expect(all.closed).toBe(false);
    expect(all.end.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("splits the prize window into Warsaw half-years and grants nothing by itself", () => {
    const second = warsawHalfYear(NOW);
    expect(second.key).toBe("2026-H2");
    expect(second.half).toBe(2);
    expect(second.start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(second.end.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(warsawHalfYear(new Date("2026-03-15T12:00:00.000Z")).key).toBe("2026-H1");
  });
});
