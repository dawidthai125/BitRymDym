/**
 * Header plan badge + limits popover — pure model (no I/O, unit-tested).
 * Every number comes from plan-policy (`PLAN_POLICY`); usage counts come from
 * the server (`plan-usage.ts`). The UI never derives limits on its own.
 */

import { PLAN_POLICY } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

export type PlanUsageItemId =
  | "beatDownloads"
  | "studioExports"
  | "projects"
  | "recordingsToday"
  | "activeTakes"
  | "masters"
  | "tracks";

export type PlanUsagePeriod = "day" | "week" | "month" | "total" | "perProject";

export type PlanUsageItem = {
  id: PlanUsageItemId;
  /** null when the item is a per-project ceiling (tracks). */
  used: number | null;
  /** null = no cap. 0 together with `locked` = not in this plan. */
  limit: number | null;
  period: PlanUsagePeriod;
  /** Not available on this plan (e.g. Free downloads) — shown with 🔒. */
  locked: boolean;
  /** When a day/month counter starts again (ISO), if it applies. */
  resetAt: string | null;
};

export type PlanUsage = {
  tier: PremiumTier;
  items: PlanUsageItem[];
  generatedAt: string;
};

export type PlanUsageCounts = {
  beatDownloadsToday: number;
  studioExportsWeek: number;
  activeProjects: number;
  takesToday: number;
  activeReadyTakes: number;
  mastersMonth: number;
};

export function nextUtcMidnightIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

export function buildPlanUsage(params: {
  tier: PremiumTier;
  counts: PlanUsageCounts;
  monthResetAt: string;
  now: Date;
}): PlanUsage {
  const p = PLAN_POLICY[params.tier];
  const c = params.counts;
  const dayReset = nextUtcMidnightIso(params.now);
  const canDownloadFiles = p.downloads.qualities.length > 0;
  return {
    tier: params.tier,
    generatedAt: params.now.toISOString(),
    items: [
      {
        id: "beatDownloads",
        used: c.beatDownloadsToday,
        limit: p.downloads.beatsPerDay,
        period: "day",
        locked: p.downloads.beatsPerDay === 0,
        resetAt: p.downloads.beatsPerDay === 0 ? null : dayReset,
      },
      {
        id: "studioExports",
        used: c.studioExportsWeek,
        // No plan has a weekly file cap (deliver/policy DELIVER_WEEKLY_LIMIT).
        limit: canDownloadFiles ? null : 0,
        period: "week",
        locked: !canDownloadFiles,
        resetAt: null,
      },
      {
        id: "projects",
        used: c.activeProjects,
        limit: p.studio.maxProjects,
        period: "total",
        locked: false,
        resetAt: null,
      },
      {
        id: "recordingsToday",
        used: c.takesToday,
        limit: p.recording.sessionsPerDay,
        period: "day",
        locked: false,
        resetAt: dayReset,
      },
      {
        id: "activeTakes",
        used: c.activeReadyTakes,
        limit: p.recording.maxActiveReady,
        period: "total",
        locked: false,
        resetAt: null,
      },
      {
        id: "masters",
        used: c.mastersMonth,
        limit: p.mastering.mastersPerMonth,
        period: "month",
        locked: false,
        resetAt: params.monthResetAt,
      },
      {
        id: "tracks",
        used: null,
        limit: p.studio.maxRecordingTracks,
        period: "perProject",
        locked: false,
        resetAt: null,
      },
    ],
  };
}

/** True when a counted item has no room left (badge turns amber). */
export function isPlanItemExhausted(item: PlanUsageItem): boolean {
  if (item.locked || item.used === null || item.limit === null) return false;
  return item.used >= item.limit;
}
