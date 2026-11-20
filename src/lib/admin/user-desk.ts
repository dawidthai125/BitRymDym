import "server-only";

import { PLAN_POLICY } from "@/config/plan-policy";
import { addonStatusFromRow, type AdminAddonStatus } from "@/lib/admin/users-addons";
import { assembleAdminUserRow, type AdminUserRow } from "@/lib/admin/users-assemble";
import { requireAdminUsersListAccess } from "@/lib/admin/users-list";
import type { PremiumEntitlementSnapshot } from "@/lib/audio/effective-entitlement";
import { isUuid } from "@/lib/beats/audio-validation";
import { loadPlanUsage } from "@/lib/plans/plan-usage";
import { loadUsageResets } from "@/lib/plans/usage-resets";
import { windowStartAfterReset, type UsageResetMetric } from "@/lib/plans/usage-resets-model";
import { NOT_SAMPLE_COPY_TAKE } from "@/lib/studio/samples/sample-policy";
import { countsTowardCleanupQuota } from "@/lib/studio/cleanup/cleanup-core";
import { warsawDayStartIso } from "@/lib/studio/cleanup/cleanup-server";
import { aiCoverPerDay } from "@/lib/studio/video/ai-cover/config";
import { warsawWeekStartIso } from "@/lib/studio/video/youtube-video";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/types/premium";
import type { AccountLevel, SystemRole } from "@/types/domain";

/** One quota line on the admin user card. `limit` null = no cap. */
export type AdminDeskLimit = {
  id: string;
  metric: UsageResetMetric;
  used: number;
  limit: number | null;
  period: "day" | "week" | "month";
  /** Last admin reset of this metric (ISO), if any. */
  resetAt: string | null;
};

export type AdminUserDesk = {
  user: AdminUserRow;
  isSelf: boolean;
  referenceAddon: AdminAddonStatus | null;
  limits: AdminDeskLimit[];
  projects: { id: string; title: string | null; status: string | null; updatedAt: string | null; createdAt: string | null }[];
  beats: { id: string; title: string | null; status: string | null; ownershipType: string | null; createdAt: string | null }[];
  takes: { id: string; title: string | null; status: string | null; createdAt: string | null; durationSeconds: number | null; deleted: boolean }[];
  songs: { id: string; projectId: string; title: string | null; createdAt: string | null; paidWithCredit: boolean; catalog: "published" | "withdrawn" | null }[];
  exports: { id: string; kind: string | null; status: string | null; createdAt: string | null; projectId: string | null }[];
  payments: { id: string; status: string | null; product: string; amountGrosz: number | null; currency: string | null; createdAt: string | null }[];
};

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Res<T> = { data: T[] | null; error: { message: string } | null };
const rows = <T,>(res: Res<T>): T[] => (res.error ? [] : (res.data ?? []));
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function headCount(q: PromiseLike<{ count: number | null; error: { code?: string } | null }>): Promise<number> {
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

export async function loadAdminUserDesk(userId: string): Promise<AdminUserDesk | null> {
  const viewer = await requireAdminUsersListAccess();
  if (!isUuid(userId)) return null;
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, display_name, user_number, role, account_level, experience_total")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return null;

  const authUser = await admin.auth.admin.getUserById(userId);
  const email = authUser.data.user?.email ?? null;

  const { data: entitlementRows } = await admin
    .from("premium_entitlements")
    .select("user_id, active, source, expires_at, tier")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  const ent = entitlementRows?.[0];
  const premium: PremiumEntitlementSnapshot | null = ent
    ? {
        userId,
        active: Boolean(ent.active),
        source: String(ent.source ?? ""),
        expiresAt: typeof ent.expires_at === "string" ? ent.expires_at : null,
        tier: isPremiumTier(ent.tier) ? ent.tier : null,
      }
    : null;

  const user = assembleAdminUserRow({
    profile: {
      id: profile.id as string,
      displayName: (profile.display_name as string | null) ?? null,
      userNumber: profile.user_number == null ? null : Number(profile.user_number),
      role: profile.role as SystemRole,
      accountLevel: profile.account_level as AccountLevel,
      experienceTotal: Number(profile.experience_total ?? 0),
    },
    premium,
    email,
  });

  const [projects, beats, takes, songs, jobs, payments, works, limits, addon] = await Promise.all([
    admin.from("studio_projects").select("id, title, status, updated_at, created_at").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(200),
    admin.from("beats").select("id, title, status, ownership_type, created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200),
    admin.from("takes").select("id, title, status, created_at, duration_seconds, deleted_at").eq("owner_id", userId).eq("is_stem", false).or(NOT_SAMPLE_COPY_TAKE).order("created_at", { ascending: false }).limit(200),
    admin.from("studio_song_completions").select("id, project_id, created_at, paid_with_credit").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200),
    admin.from("studio_master_jobs").select("id, kind, status, created_at, project_id").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200),
    admin.from("payment_orders").select("id, status, product_kind, plan_tier, addon, pack, period, amount_grosz, currency, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    admin.from("catalog_works").select("project_id, published_at, withdrawn_at").eq("owner_id", userId).limit(500),
    loadDeskLimits(admin, userId, user.premiumTier),
    admin.from("plan_addon_entitlements").select("starts_at, ends_at, revoked_at, note").eq("user_id", userId).eq("addon", "reference_mastering").is("revoked_at", null).limit(1).maybeSingle(),
  ]);

  const projectRows = rows(projects as Res<Record<string, unknown>>);
  const titleById = new Map(projectRows.map((p) => [String(p.id), str(p.title)]));
  const workByProject = new Map(
    rows(works as Res<Record<string, unknown>>).map((w) => [
      String(w.project_id),
      w.withdrawn_at ? ("withdrawn" as const) : w.published_at ? ("published" as const) : null,
    ]),
  );

  return {
    user,
    isSelf: viewer.userId === userId,
    referenceAddon: addon.error ? null : addonStatusFromRow(addon.data ?? null),
    limits,
    projects: projectRows.map((row) => ({
      id: String(row.id),
      title: str(row.title),
      status: str(row.status),
      updatedAt: str(row.updated_at),
      createdAt: str(row.created_at),
    })),
    beats: rows(beats as Res<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      title: str(row.title),
      status: str(row.status),
      ownershipType: str(row.ownership_type),
      createdAt: str(row.created_at),
    })),
    takes: rows(takes as Res<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      title: str(row.title),
      status: row.deleted_at ? "DELETED" : str(row.status),
      createdAt: str(row.created_at),
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
      deleted: row.deleted_at != null,
    })),
    songs: rows(songs as Res<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      title: titleById.get(String(row.project_id)) ?? null,
      createdAt: str(row.created_at),
      paidWithCredit: Boolean(row.paid_with_credit),
      catalog: workByProject.get(String(row.project_id)) ?? null,
    })),
    exports: rows(jobs as Res<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      kind: str(row.kind),
      status: str(row.status),
      createdAt: str(row.created_at),
      projectId: str(row.project_id),
    })),
    payments: rows(payments as Res<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      status: str(row.status),
      product: [str(row.product_kind), str(row.plan_tier) ?? str(row.addon) ?? str(row.pack), str(row.period)].filter(Boolean).join(" · "),
      amountGrosz: row.amount_grosz == null ? null : Number(row.amount_grosz),
      currency: str(row.currency),
      createdAt: str(row.created_at),
    })),
  };
}

/** Quota lines with the user's current usage (admin resets already applied). */
async function loadDeskLimits(admin: Admin, userId: string, tier: AdminUserRow["premiumTier"]): Promise<AdminDeskLimit[]> {
  const policy = PLAN_POLICY[tier];
  const [usage, resets] = await Promise.all([loadPlanUsage({ userId, tier }), loadUsageResets(userId, admin)]);
  const day = warsawDayStartIso();
  const week = warsawWeekStartIso();
  const head = { count: "exact" as const, head: true };
  const [lyrics, cleanup, cover, video] = await Promise.all([
    headCount(admin.from("studio_ai_lyrics_usage").select("id", head).eq("owner_id", userId).gte("created_at", windowStartAfterReset(day, resets.lyrics)).neq("status", "failed")),
    // Same rule as the cleanup quota: automatic clip-noise passes do not count.
    admin.from("studio_cleanup_jobs").select("settings").eq("owner_id", userId).gte("created_at", windowStartAfterReset(day, resets.cleanup)).not("status", "in", "(failed,cancelled)")
      .then((r) => (r.error ? 0 : (r.data ?? []).filter((row) => countsTowardCleanupQuota((row as { settings: unknown }).settings)).length)),
    headCount(admin.from("studio_ai_cover_usage").select("id", head).eq("owner_id", userId).gte("created_at", windowStartAfterReset(day, resets.cover)).neq("status", "failed")),
    headCount(admin.from("studio_master_jobs").select("id", head).eq("owner_id", userId).eq("kind", "youtube_video").gte("created_at", windowStartAfterReset(week, resets.video)).not("status", "in", "(failed,cancelled)")),
  ]);
  const item = (id: string) => usage.items.find((i) => i.id === id);
  const fromUsage = (id: string, metric: UsageResetMetric, period: AdminDeskLimit["period"]): AdminDeskLimit => {
    const it = item(id);
    return { id, metric, used: it?.used ?? 0, limit: it?.locked ? 0 : (it?.limit ?? null), period, resetAt: resets[metric] ?? null };
  };
  return [
    fromUsage("recordingsToday", "recordings", "day"),
    fromUsage("masters", "masters", "month"),
    fromUsage("beatDownloads", "downloads", "day"),
    fromUsage("studioExports", "downloads", "week"),
    { id: "video", metric: "video", used: video, limit: policy.downloads.youtubeVideosPerWeek, period: "week", resetAt: resets.video ?? null },
    { id: "lyrics", metric: "lyrics", used: lyrics, limit: policy.tools.aiLyricsPerDay, period: "day", resetAt: resets.lyrics ?? null },
    { id: "cleanup", metric: "cleanup", used: cleanup, limit: policy.tools.vocalCleanup.perDay, period: "day", resetAt: resets.cleanup ?? null },
    { id: "cover", metric: "cover", used: cover, limit: tier === "GOLD" ? aiCoverPerDay() : 0, period: "day", resetAt: resets.cover ?? null },
  ];
}
