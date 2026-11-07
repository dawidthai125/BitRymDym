import { describe, expect, it } from "vitest";

import {
  aggregateRatings,
  bayesianScore,
  MIN_RATERS,
  previousPeriod,
  prizesFor,
  rankTargets,
  rewardGrant,
  warsawPeriod,
} from "@/lib/community/ranking-policy";

const NOW = new Date("2026-11-07T12:00:00.000Z");

describe("warsaw periods", () => {
  it("starts the week on Monday in Europe/Warsaw and lasts seven days", () => {
    const week = warsawPeriod(NOW, "week");
    expect(week.key).toBe("2026-W45");
    expect(week.start.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(week.end.getTime() - week.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(week.closed).toBe(false);
    const previous = previousPeriod(week, NOW);
    expect(previous.key).toBe("2026-W44");
    expect(previous.closed).toBe(true);
  });

  it("uses the Warsaw calendar month", () => {
    const month = warsawPeriod(NOW, "month");
    expect(month.key).toBe("2026-11");
    expect(month.start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(month.end.toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
});

describe("ranking score", () => {
  it("drops the owner's vote and ranks a crowd of fours above one five", () => {
    const period = warsawPeriod(NOW, "week");
    const rows = aggregateRatings(
      [
        { targetId: "solo", ownerId: "a", userId: "a", stars: 5, at: "2026-11-03T10:00:00.000Z" },
        { targetId: "solo", ownerId: "a", userId: "b", stars: 5, at: "2026-11-03T10:00:00.000Z" },
        { targetId: "crowd", ownerId: "c", userId: "d", stars: 4, at: "2026-11-04T10:00:00.000Z" },
        { targetId: "crowd", ownerId: "c", userId: "e", stars: 4, at: "2026-11-04T10:00:00.000Z" },
        { targetId: "crowd", ownerId: "c", userId: "f", stars: 4, at: "2026-11-04T10:00:00.000Z" },
        { targetId: "crowd", ownerId: "c", userId: "g", stars: 4, at: "2026-11-04T10:00:00.000Z" },
        { targetId: "crowd", ownerId: "c", userId: "h", stars: 4, at: "2026-11-04T10:00:00.000Z" },
        { targetId: "old", ownerId: "c", userId: "z", stars: 5, at: "2026-10-01T10:00:00.000Z" },
      ],
      period.start,
      period.end,
    );
    const ranked = rankTargets(rows);
    expect(ranked.map((row) => row.targetId)).toEqual(["crowd", "solo"]);
    expect(bayesianScore(5, 1)).toBeLessThan(bayesianScore(20, 5));
    expect(ranked[0]?.count).toBe(5);
    expect(ranked[1]?.count).toBe(1);
  });

  it("gives weekly days and a monthly package only after three outside votes", () => {
    const ranked = rankTargets([
      { targetId: "house", ownerId: null, sum: 15, count: 3 },
      { targetId: "thin", ownerId: "user-1", sum: 10, count: 2 },
      { targetId: "first", ownerId: "user-2", sum: 15, count: 3 },
      { targetId: "second", ownerId: "user-3", sum: 12, count: 3 },
      { targetId: "third", ownerId: "user-4", sum: 9, count: MIN_RATERS },
    ]);
    expect(prizesFor("week", ranked).map((prize) => [prize.place, prize.days, prize.tier])).toEqual([
      [1, 7, "EXTEND"],
      [2, 3, "EXTEND"],
      [3, 1, "EXTEND"],
    ]);
    expect(prizesFor("month", ranked).map((prize) => prize.tier)).toEqual(["GOLD", "SILVER", "BRONZE"]);
    expect(prizesFor("week", ranked).some((prize) => prize.targetId === "house" || prize.targetId === "thin")).toBe(false);
  });
});

describe("reward claim", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");

  it("starts Bronze for a free account and extends the current paid plan by the prize days", () => {
    const fresh = rewardGrant({ mode: "extend_days", tier: "EXTEND", days: 7 }, null, now);
    expect(fresh).toMatchObject({ action: "plan", tier: "BRONZE" });
    if (fresh.action !== "plan") return;
    expect(Date.parse(fresh.expiresAt) - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    const gold = rewardGrant(
      { mode: "extend_days", tier: "EXTEND", days: 3 },
      { tier: "GOLD", active: true, expiresAt: "2026-11-20T12:00:00.000Z" },
      now,
    );
    expect(gold).toMatchObject({ action: "plan", tier: "GOLD", expiresAt: "2026-11-23T12:00:00.000Z" });
  });

  it("queues a lower monthly prize and refuses a perpetual grant", () => {
    const queued = rewardGrant(
      { mode: "package_month", tier: "BRONZE", days: 30 },
      { tier: "GOLD", active: true, expiresAt: "2026-12-01T00:00:00.000Z" },
      now,
    );
    expect(queued.action).toBe("schedule");
    const blocked = rewardGrant(
      { mode: "package_month", tier: "GOLD", days: 30 },
      { tier: "GOLD", active: true, expiresAt: null },
      now,
    );
    expect(blocked).toEqual({ action: "skip", note: "perpetual" });
  });
});
