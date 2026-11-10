/**
 * Half-year prize for one finished track. The winner turns it on.
 * The clock starts at that click. It does not use community_rewards.
 */

import {
  isLivePaid,
  withDuePlan,
  type PlanSnapshot,
} from "@/lib/payments/entitlement-grant";
import { warsawHalfYear } from "@/lib/catalog/catalog-policy";

export const WORK_PRIZE_SOURCE = "work_prize";
export const WORK_PRIZE_DAYS = 365;
export const WORK_ALL_PLACES = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PrizeConsent =
  | { kind: "free" }
  | { kind: "gold"; daysLeft: number; until: string; queued: boolean }
  | { kind: "pause"; tier: "BRONZE" | "SILVER"; daysLeft: number; until: string; queued: boolean }
  | { kind: "perpetual" }
  | { kind: "already" };

export function previousHalfYear(now: Date) {
  const current = warsawHalfYear(now);
  return warsawHalfYear(new Date(current.start.getTime() - 1));
}

export function wholeDays(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

/** What the profile must say before the winner turns the prize on. */
export function prizeConsent(plan: PlanSnapshot, source: string | null, now: Date): PrizeConsent {
  const current = withDuePlan(plan, now);
  const folded = (current?.tier ?? null) !== (plan?.tier ?? null);
  if (isLivePaid(current, now) && source === WORK_PRIZE_SOURCE && !folded) return { kind: "already" };
  if (isLivePaid(current, now) && current.expiresAt === null) return { kind: "perpetual" };
  if (!isLivePaid(current, now) || current.expiresAt === null) return { kind: "free" };
  const left = Date.parse(current.expiresAt) - now.getTime();
  const queued = Boolean(current.pendingTier && current.pendingExpiresAt);
  if (current.tier === "GOLD") {
    return { kind: "gold", daysLeft: wholeDays(left), until: current.expiresAt, queued };
  }
  return {
    kind: "pause",
    tier: current.tier,
    daysLeft: wholeDays(left),
    until: current.expiresAt,
    queued,
  };
}

export function resumeOpen(plan: PlanSnapshot, now: Date): boolean {
  return !isLivePaid(withDuePlan(plan, now), now);
}
