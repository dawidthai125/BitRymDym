/**
 * Pure UTC calendar-day helpers for download limits (OD-05 / OD-06).
 * No I/O — unit-testable.
 */

/** Start of the UTC calendar day containing `now` (inclusive lower bound). */
export function utcDayWindowStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
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
