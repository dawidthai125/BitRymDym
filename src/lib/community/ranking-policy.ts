/**
 * Community ranking. One vote per person per beat or sample, counted in the
 * Europe/Warsaw week or month when it was first cast. Own work does not count.
 * A prize needs three different raters. Weekly prizes are extra premium days.
 * Monthly prizes are one billing month: Gold, Silver, Bronze.
 */

import {
  addBillingPeriod,
  addDays,
  grantPlanFor,
  isLivePaid,
  withDuePlan,
  type PlanSnapshot,
} from "@/lib/payments/entitlement-grant";
import type { PaidTier } from "@/config/plan-policy";

export const COMMUNITY_ZONE = "Europe/Warsaw";
export const MIN_RATERS = 3;
export const PRIOR_COUNT = 3;
export const PRIOR_MEAN = 3;
export const COMMENT_MAX = 500;
export const WEEK_PRIZE_DAYS = [7, 3, 1] as const;
export const MONTH_PRIZE_TIERS = ["GOLD", "SILVER", "BRONZE"] as const;

export type TargetKind = "beat" | "sample";
export type PeriodKind = "week" | "month";
export type RewardMode = "extend_days" | "package_month";
export type RewardTier = "EXTEND" | PaidTier;

export type PeriodWindow = {
  kind: PeriodKind;
  key: string;
  start: Date;
  end: Date;
  closed: boolean;
};

const WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function zoneParts(instant: Date, timeZone: string) {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant)) {
    bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    weekday: WEEKDAY[bag.weekday ?? ""] ?? 1,
  };
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)) {
    bag[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(bag.hour) % 24,
    Number(bag.minute),
    Number(bag.second),
  );
  return asUtc - instant.getTime();
}

export function zonedMidnight(year: number, month: number, day: number, timeZone = COMMUNITY_ZONE): Date {
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let pass = 0; pass < 3; pass += 1) {
    utc = Date.UTC(year, month - 1, day, 0, 0, 0) - zoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

function shiftCivil(year: number, month: number, day: number, days: number) {
  const cursor = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}

function isoWeek(year: number, month: number, day: number): { year: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}

export function warsawPeriod(now: Date, kind: PeriodKind, timeZone = COMMUNITY_ZONE): PeriodWindow {
  const civil = zoneParts(now, timeZone);
  if (kind === "month") {
    const start = zonedMidnight(civil.year, civil.month, 1, timeZone);
    const next = civil.month === 12
      ? zonedMidnight(civil.year + 1, 1, 1, timeZone)
      : zonedMidnight(civil.year, civil.month + 1, 1, timeZone);
    return {
      kind,
      key: `${civil.year}-${String(civil.month).padStart(2, "0")}`,
      start,
      end: next,
      closed: now.getTime() >= next.getTime(),
    };
  }
  const monday = shiftCivil(civil.year, civil.month, civil.day, 1 - civil.weekday);
  const nextMonday = shiftCivil(monday.year, monday.month, monday.day, 7);
  const start = zonedMidnight(monday.year, monday.month, monday.day, timeZone);
  const end = zonedMidnight(nextMonday.year, nextMonday.month, nextMonday.day, timeZone);
  const iso = isoWeek(monday.year, monday.month, monday.day);
  return {
    kind,
    key: `${iso.year}-W${String(iso.week).padStart(2, "0")}`,
    start,
    end,
    closed: now.getTime() >= end.getTime(),
  };
}

export function previousPeriod(period: PeriodWindow, now: Date, timeZone = COMMUNITY_ZONE): PeriodWindow {
  const window = warsawPeriod(new Date(period.start.getTime() - 1), period.kind, timeZone);
  return { ...window, closed: now.getTime() >= window.end.getTime() };
}

export function bayesianScore(sum: number, count: number): number {
  if (count <= 0) return 0;
  return (PRIOR_COUNT * PRIOR_MEAN + sum) / (PRIOR_COUNT + count);
}

export type RatingInput = {
  targetId: string;
  ownerId: string | null;
  userId: string;
  stars: number;
  at: string;
};

export type Aggregate = {
  targetId: string;
  ownerId: string | null;
  sum: number;
  count: number;
};

export function aggregateRatings(rows: readonly RatingInput[], start: Date, end: Date): Aggregate[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const map = new Map<string, Aggregate>();
  for (const row of rows) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at < startMs || at >= endMs) continue;
    if (!Number.isInteger(row.stars) || row.stars < 1 || row.stars > 5) continue;
    if (row.ownerId && row.ownerId === row.userId) continue;
    const current = map.get(row.targetId) ?? {
      targetId: row.targetId,
      ownerId: row.ownerId,
      sum: 0,
      count: 0,
    };
    current.sum += row.stars;
    current.count += 1;
    map.set(row.targetId, current);
  }
  return [...map.values()];
}

export type Ranked = Aggregate & { place: number; score: number };

export function rankTargets(rows: readonly Aggregate[]): Ranked[] {
  return [...rows]
    .sort((a, b) => {
      const score = bayesianScore(b.sum, b.count) - bayesianScore(a.sum, a.count);
      if (score !== 0) return score;
      if (b.count !== a.count) return b.count - a.count;
      return a.targetId < b.targetId ? -1 : 1;
    })
    .map((row, index) => ({
      ...row,
      place: index + 1,
      score: bayesianScore(row.sum, row.count),
    }));
}

export type Prize = {
  place: number;
  targetId: string;
  ownerId: string;
  mode: RewardMode;
  tier: RewardTier;
  days: number;
};

/** Top three works that have an owner and at least MIN_RATERS. Platform rows stay on the board and take no prize. */
export function prizesFor(kind: PeriodKind, ranked: readonly Ranked[]): Prize[] {
  const eligible = ranked.filter((row) => row.ownerId && row.count >= MIN_RATERS);
  return eligible.slice(0, 3).map((row, index) => {
    if (kind === "week") {
      return {
        place: index + 1,
        targetId: row.targetId,
        ownerId: row.ownerId as string,
        mode: "extend_days",
        tier: "EXTEND",
        days: WEEK_PRIZE_DAYS[index] ?? 1,
      };
    }
    return {
      place: index + 1,
      targetId: row.targetId,
      ownerId: row.ownerId as string,
      mode: "package_month",
      tier: MONTH_PRIZE_TIERS[index] ?? "BRONZE",
      days: 30,
    };
  });
}

export type RewardSpec = {
  mode: RewardMode;
  tier: RewardTier;
  days: number;
};

export function rewardGrant(reward: RewardSpec, plan: PlanSnapshot, now: Date) {
  if (reward.mode === "extend_days") {
    const current = withDuePlan(plan, now);
    if (isLivePaid(current, now) && current.expiresAt === null) {
      return { action: "skip" as const, note: "perpetual" as const };
    }
    const tier: PaidTier = isLivePaid(current, now) ? current.tier : "BRONZE";
    const days = Math.min(31, Math.max(1, reward.days));
    return grantPlanFor(plan, tier, (base) => addDays(base, days), now);
  }
  if (reward.tier === "EXTEND") return { action: "skip" as const, note: "perpetual" as const };
  return grantPlanFor(plan, reward.tier, (base) => addBillingPeriod(base, "month"), now);
}

export function cleanComment(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const text = body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!text || text.length > COMMENT_MAX) return null;
  return text;
}
