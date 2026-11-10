import { describe, expect, it } from "vitest";

import { warsawPeriod } from "@/lib/community/ranking-policy";
import { cleanWorkTitle, normalizeWorkConsents, warsawHalfYear, workWindow } from "@/lib/catalog/catalog-policy";

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
