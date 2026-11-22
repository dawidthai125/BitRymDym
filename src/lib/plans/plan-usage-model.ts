/**
 * Header plan badge + limits popover — pure model (no I/O, unit-tested).
 * Every number comes from plan-policy (`PLAN_POLICY`); usage counts come from
 * the server (`plan-usage.ts`). The UI never derives limits on its own.
 */

import { PLAN_POLICY } from "@/config/plan-policy";
import { masterQuotaWithCredits } from "@/lib/studio/quota-credits";
import type { PremiumTier } from "@/types/premium";

export type PlanUsageItemId =
  | "beatDownloads"
  | "studioExports"
  | "projects"
  | "recordingsToday"
  | "activeTakes"
  | "masters"
  | "video"
  | "lyrics"
  | "cleanup"
  | "cover"
  | "samples"
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
  /** 2026-11-22: the rest of the plan's counted limits (Owner: the menu missed MP4 etc.). */
  videosWeek?: number;
  lyricsToday?: number;
  cleanupToday?: number;
  coversToday?: number;
  samples?: number;
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
  /** Unused one-off packs. Zero keeps the plan cap. */
  takeCredits?: number;
  masterCredits?: number;
  youtubeCredits?: number;
  /** AI covers per day (Gold, only when the feature is on); 0 hides the row. */
  coverPerDay?: number;
  /** Europe/Warsaw windows used by video / lyrics / cleanup / cover counters. */
  warsawDayResetAt?: string | null;
  warsawWeekResetAt?: string | null;
}): PlanUsage {
  const p = PLAN_POLICY[params.tier];
  const c = params.counts;
  const takeCredits = params.takeCredits ?? 0;
  const masterCredits = params.masterCredits ?? 0;
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
        limit: masterQuotaWithCredits(c.takesToday, p.recording.sessionsPerDay, takeCredits),
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
        limit: masterQuotaWithCredits(c.mastersMonth, p.mastering.mastersPerMonth, masterCredits),
        period: "month",
        locked: false,
        resetAt: params.monthResetAt,
      },
      ...extraItems(p, c, params),
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

function extraItems(
  p: (typeof PLAN_POLICY)[PremiumTier],
  c: PlanUsageCounts,
  params: { youtubeCredits?: number; coverPerDay?: number; warsawDayResetAt?: string | null; warsawWeekResetAt?: string | null },
): PlanUsageItem[] {
  const day = params.warsawDayResetAt ?? null;
  const videosUsed = c.videosWeek ?? 0;
  const videoPlan = p.downloads.youtubeVideosPerWeek;
  const videoCredits = Math.max(0, Math.floor(params.youtubeCredits ?? 0));
  const videoLimit = masterQuotaWithCredits(videosUsed, videoPlan, videoCredits);
  const items: PlanUsageItem[] = [
    {
      id: "video",
      used: videosUsed,
      limit: videoLimit,
      period: "week",
      // Bronze/Silver: only bought pieces. Locked until a pack is bought (the "+" still shows).
      locked: videoPlan === 0 && videoCredits === 0,
      resetAt: videoPlan > 0 ? (params.warsawWeekResetAt ?? null) : null,
    },
    {
      id: "lyrics",
      used: c.lyricsToday ?? 0,
      limit: p.tools.aiLyricsPerDay,
      period: "day",
      locked: p.tools.aiLyricsPerDay === 0,
      resetAt: day,
    },
    {
      id: "cleanup",
      used: c.cleanupToday ?? 0,
      limit: p.tools.vocalCleanup.perDay,
      period: "day",
      locked: p.tools.vocalCleanup.perDay === 0,
      resetAt: day,
    },
  ];
  const cover = Math.max(0, Math.floor(params.coverPerDay ?? 0));
  if (cover > 0) items.push({ id: "cover", used: c.coversToday ?? 0, limit: cover, period: "day", locked: false, resetAt: day });
  items.push({ id: "samples", used: c.samples ?? 0, limit: p.studio.maxSamples, period: "total", locked: p.studio.maxSamples === 0, resetAt: null });
  return items;
}

/** True when a counted item has no room left (badge turns amber). */
export function isPlanItemExhausted(item: PlanUsageItem): boolean {
  if (item.locked || item.used === null || item.limit === null) return false;
  return item.used >= item.limit;
}
