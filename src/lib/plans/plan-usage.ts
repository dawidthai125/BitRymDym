import "server-only";

import { studioQuotaRemaining } from "@/lib/studio/quota-credits-read";
import { warsawMonthWindow } from "@/lib/studio/studio-plan-limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPlanUsage, type PlanUsage } from "@/lib/plans/plan-usage-model";
import { loadUsageResets } from "@/lib/plans/usage-resets";
import { windowStartAfterReset } from "@/lib/plans/usage-resets-model";
import { STUDIO_SAMPLES_TABLE } from "@/lib/studio/samples/sample-policy";
import { countsTowardCleanupQuota } from "@/lib/studio/cleanup/cleanup-core";
import { warsawDayStartIso } from "@/lib/studio/cleanup/cleanup-server";
import { aiCoverEnabled, aiCoverPerDay } from "@/lib/studio/video/ai-cover/config";
import { warsawWeekStartIso } from "@/lib/studio/video/youtube-video";
import type { PremiumTier } from "@/types/premium";

type HeadResult = { count: number | null; error: { message?: string; code?: string } | null };

/** Missing table/column (older DB) counts as 0 instead of failing the header. */
function countOf(r: HeadResult): number {
  if (r.error) {
    if (r.error.code === "42P01" || r.error.code === "42703" || r.error.code === "PGRST205") return 0;
    throw new Error(r.error.message ?? "plan_usage_failed");
  }
  return r.count ?? 0;
}

/**
 * One cheap round of head-only COUNTs (indexed owner/user + created_at),
 * run in parallel. Cached per user for 30 s by the route's Cache-Control.
 */
export async function loadPlanUsage(params: {
  userId: string;
  tier: PremiumTier;
  now?: Date;
}): Promise<PlanUsage> {
  const now = params.now ?? new Date();
  const admin = createSupabaseAdminClient();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 864e5).toISOString();
  const month = warsawMonthWindow(now);
  const head = { count: "exact" as const, head: true };
  // Admin "reset limits" moves a counter's window start forward (usage_resets).
  const resets = await loadUsageResets(params.userId, admin);
  const dlDayStart = windowStartAfterReset(dayStart, resets.downloads);
  const dlWeekStart = windowStartAfterReset(weekStart, resets.downloads);
  const recDayStart = windowStartAfterReset(dayStart, resets.recordings);
  const masterStart = windowStartAfterReset(month.startIso, resets.masters);
  // Same windows as the enforcing code: video (Warsaw week), lyrics / cleanup / cover (Warsaw day).
  const wDay = warsawDayStartIso(now);
  const wWeek = warsawWeekStartIso(now);
  const coverPerDay = params.tier === "GOLD" && aiCoverEnabled() ? aiCoverPerDay() : 0;

  const [downloads, exports, projects, takesToday, activeTakes, masters, takeCredits, masterCredits] =
    await Promise.all([
      admin.from("beat_download_events").select("id", head).eq("user_id", params.userId).gte("created_at", dlDayStart),
      admin.from("studio_download_usage").select("owner_id", head).eq("owner_id", params.userId).gte("created_at", dlWeekStart),
      admin.from("studio_projects").select("id", head).eq("owner_id", params.userId).neq("status", "ARCHIVED"),
      // Owner 2026-11-13: "Nagrania" today = finished songs (first master download of a project).
      admin.from("studio_song_completions").select("id", head).eq("owner_id", params.userId).gte("created_at", recDayStart),
      // Same rule as the recording cap (public.count_active_loose_takes, Owner 2026-11-22).
      admin.rpc("count_active_loose_takes", { p_owner_id: params.userId }).then((r) => ({ count: typeof r.data === "number" ? r.data : Number(r.data ?? 0), error: r.error })),
      admin.from("studio_master_jobs").select("id", head).eq("owner_id", params.userId).eq("kind", "master").gte("created_at", masterStart).not("status", "in", "(failed,cancelled)"),
      studioQuotaRemaining(params.userId, "take"),
      studioQuotaRemaining(params.userId, "master"),
    ]);
  const [videos, lyrics, cleanup, covers, samples, youtubeCredits] = await Promise.all([
    admin.from("studio_master_jobs").select("id", head).eq("owner_id", params.userId).eq("kind", "youtube_video").gte("created_at", windowStartAfterReset(wWeek, resets.video)).not("status", "in", "(failed,cancelled)"),
    admin.from("studio_ai_lyrics_usage").select("id", head).eq("owner_id", params.userId).gte("created_at", windowStartAfterReset(wDay, resets.lyrics)).neq("status", "failed"),
    // Automatic clip-noise passes do not count (same rule as the cleanup quota).
    admin.from("studio_cleanup_jobs").select("settings").eq("owner_id", params.userId).gte("created_at", windowStartAfterReset(wDay, resets.cleanup)).not("status", "in", "(failed,cancelled)")
      .then((r) => (r.error ? 0 : (r.data ?? []).filter((row) => countsTowardCleanupQuota((row as { settings: unknown }).settings)).length)),
    coverPerDay > 0
      ? admin.from("studio_ai_cover_usage").select("id", head).eq("owner_id", params.userId).gte("created_at", windowStartAfterReset(wDay, resets.cover)).neq("status", "failed")
      : Promise.resolve({ count: 0, error: null }),
    admin.from(STUDIO_SAMPLES_TABLE).select("id", head).eq("owner_id", params.userId),
    studioQuotaRemaining(params.userId, "youtube"),
  ]);

  return buildPlanUsage({
    tier: params.tier,
    now,
    monthResetAt: month.resetIso,
    takeCredits,
    masterCredits,
    youtubeCredits,
    coverPerDay,
    warsawDayResetAt: warsawDayStartIso(new Date(Date.parse(wDay) + 36 * 3600_000)),
    warsawWeekResetAt: warsawWeekStartIso(new Date(Date.parse(wWeek) + 8.5 * 864e5)),
    counts: {
      beatDownloadsToday: countOf(downloads as HeadResult),
      studioExportsWeek: countOf(exports as HeadResult),
      activeProjects: countOf(projects as HeadResult),
      takesToday: countOf(takesToday as HeadResult),
      activeReadyTakes: countOf(activeTakes as HeadResult),
      mastersMonth: countOf(masters as HeadResult),
      videosWeek: countOf(videos as HeadResult),
      lyricsToday: countOf(lyrics as HeadResult),
      cleanupToday: cleanup,
      coversToday: countOf(covers as HeadResult),
      samples: countOf(samples as HeadResult),
    },
  });
}
