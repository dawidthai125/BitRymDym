/**
 * Pure UTC calendar-day helpers for download limits (OD-05 / OD-06).
 * W2-B: USER daily limit comes from Product Entitlement matrix (not flat USER=4).
 * No I/O — unit-testable.
 */

import { PREMIUM_ANON_DOWNLOADS_DAILY } from "@/config/premium-tiers";

/** Start of the UTC calendar day containing `now` (inclusive lower bound). */
export function utcDayWindowStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Resolve beat-download daily limit from actor + product entitlement limits.
 * ANON ≠ FREE — anonymous never inherits authenticated FREE=4.
 * Caller must supply `downloadsDaily` from resolveProductEntitlement (USER).
 * Feature code must not branch on tier labels.
 */
export function dailyDownloadLimitForActor(params: {
  actorType: "ANON" | "USER";
  /** Product entitlement `limits.downloadsDaily` — required for USER. */
  downloadsDaily?: number;
}): number {
  if (params.actorType === "ANON") {
    return PREMIUM_ANON_DOWNLOADS_DAILY;
  }
  const n = params.downloadsDaily;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new Error("USER download limit requires entitlement.limits.downloadsDaily.");
  }
  return Math.floor(n);
}

export function isWithinUtcDay(isoTimestamp: string, now: Date = new Date()): boolean {
  const created = new Date(isoTimestamp);
  if (Number.isNaN(created.getTime())) return false;
  return created.getTime() >= utcDayWindowStart(now).getTime();
}

export type DownloadLimitDecision =
  | { allowed: true; count: number; limit: number; remaining: number }
  | { allowed: false; count: number; limit: number; remaining: 0 };

/** Pure compare — used by unit tests; runtime path uses atomic DB claim. */
export function evaluateDailyLimit(params: {
  count: number;
  limit: number;
}): DownloadLimitDecision {
  const { count, limit } = params;
  if (count >= limit) {
    return { allowed: false, count, limit, remaining: 0 };
  }
  return {
    allowed: true,
    count,
    limit,
    remaining: Math.max(limit - count, 0),
  };
}
