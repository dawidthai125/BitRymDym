import "server-only";

import { warsawMonthWindow } from "@/lib/studio/studio-plan-limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPlanUsage, type PlanUsage } from "@/lib/plans/plan-usage-model";
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
  const nowIso = now.toISOString();
  const month = warsawMonthWindow(now);
  const head = { count: "exact" as const, head: true };

  const [downloads, exports, projects, takesToday, activeTakes, masters] =
    await Promise.all([
      admin.from("beat_download_events").select("id", head).eq("user_id", params.userId).gte("created_at", dayStart),
      admin.from("studio_download_usage").select("owner_id", head).eq("owner_id", params.userId).gte("created_at", weekStart),
      admin.from("studio_projects").select("id", head).eq("owner_id", params.userId).neq("status", "ARCHIVED"),
      admin.from("takes").select("id", head).eq("owner_id", params.userId).gte("created_at", dayStart),
      admin.from("takes").select("id", head).eq("owner_id", params.userId).eq("status", "READY").is("deleted_at", null).gt("expires_at", nowIso),
      admin.from("studio_master_jobs").select("id", head).eq("owner_id", params.userId).eq("kind", "master").gte("created_at", month.startIso).not("status", "in", "(failed,cancelled)"),
    ]);

  return buildPlanUsage({
    tier: params.tier,
    now,
    monthResetAt: month.resetIso,
    counts: {
      beatDownloadsToday: countOf(downloads as HeadResult),
      studioExportsWeek: countOf(exports as HeadResult),
      activeProjects: countOf(projects as HeadResult),
      takesToday: countOf(takesToday as HeadResult),
      activeReadyTakes: countOf(activeTakes as HeadResult),
      mastersMonth: countOf(masters as HeadResult),
    },
  });
}
