import "server-only";

import { after } from "next/server";
import { cache } from "react";

/**
 * "Utwór tygodnia" — server side (service_role). public.featured_works has no public policy:
 * every read goes through here and is re-checked with findLiveCatalogWork (same gate as /utwor/[id]).
 * Table missing (migration 20261122190000 not applied) → nothing featured, admin actions report "off".
 */
import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import { publicBeatCoverUrl } from "@/lib/beats/cover/cover-service";
import { findLiveCatalogWork, listPublicWorks, type CatalogCard } from "@/lib/catalog/catalog-service";
import { cleanFeaturedNote, shouldShowFeatured, warsawWeekStart } from "@/lib/catalog/featured-work";
import { loadWorkClips } from "@/lib/catalog/work-clip-server";
import type { WorkClip } from "@/lib/catalog/work-clip";
import { projectBeatId } from "@/lib/share/share-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const TABLE = "featured_works";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type FeaturedDbRow = { id: string; work_id: string; week_start: string; note: string | null };

export type FeaturedRow = { id: string; workId: string; weekStart: string; note: string | null };

export type FeaturedWorkView = {
  work: CatalogCard;
  note: string | null;
  weekStart: string;
  clip: WorkClip;
  coverUrl: string | null;
};

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

function toRow(row: FeaturedDbRow): FeaturedRow {
  return { id: row.id, workId: row.work_id, weekStart: row.week_start, note: row.note };
}

/** Raw row for the Warsaw week of `now` (no liveness check). Errors / missing table → null. */
async function readWeekRow(admin: Admin, weekStart: string): Promise<FeaturedRow | null> {
  const loaded = await admin.from(TABLE).select("id, work_id, week_start, note").eq("week_start", weekStart).maybeSingle();
  if (loaded.error || !loaded.data) return null;
  return toRow(loaded.data as FeaturedDbRow);
}

/**
 * Id of this week's featured work, only when it is still live. Request-deduped: the home page and
 * /utwory each call it once.
 */
export const currentFeaturedWorkId = cache(async function currentFeaturedWorkId(): Promise<string | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const now = new Date();
  const row = await readWeekRow(admin, warsawWeekStart(now)).catch(() => null);
  if (!row) return null;
  const live = await findLiveCatalogWork(row.workId).catch(() => null);
  return shouldShowFeatured(row, live, now) ? row.workId : null;
});

/** Home page section data. Null → the section is not rendered (no feature, withdrawn work, no table). */
export async function loadFeaturedWorkOfWeek(): Promise<FeaturedWorkView | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const now = new Date();
  const row = await readWeekRow(admin, warsawWeekStart(now)).catch(() => null);
  if (!row) return null;
  const work = await findLiveCatalogWork(row.workId).catch(() => null);
  if (!work || !shouldShowFeatured(row, work, now)) return null;
  const [clips, coverUrl] = await Promise.all([
    loadWorkClips([work.id]).catch(() => null),
    workCoverUrl(admin, work.id),
  ]);
  return {
    work,
    note: row.note,
    weekStart: row.weekStart,
    clip: clips?.get(work.id) ?? { state: "pending" },
    coverUrl,
  };
}

/** The work's beat cover, only when that beat and cover are public (same rule as the share card). */
async function workCoverUrl(admin: Admin, workId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("catalog_works").select("project_id").eq("id", workId).maybeSingle();
    const beatId = await projectBeatId((data as { project_id?: string | null } | null)?.project_id);
    return await publicBeatCoverUrl(beatId, "thumb");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- admin

export type AdminWorksView = {
  enabled: boolean;
  featuredOn: boolean;
  weekStart: string;
  works: CatalogCard[];
  current: FeaturedRow | null;
  /** Title of this week's feature while it is still live; null otherwise. */
  currentTitle: string | null;
};

/** /admin/utwory: newest public works + this week's feature. ADMIN only. */
export async function loadAdminWorks(): Promise<AdminWorksView> {
  await requireRole(["ADMIN"]);
  const weekStart = warsawWeekStart(new Date());
  const admin = adminOrNull();
  const [listed, probe] = await Promise.all([
    listPublicWorks({ limit: 100 }).catch(() => ({ enabled: false, works: [] as CatalogCard[] })),
    admin
      ? admin.from(TABLE).select("id, work_id, week_start, note").eq("week_start", weekStart).maybeSingle()
      : Promise.resolve(null),
  ]);
  const featuredOn = Boolean(probe && !probe.error);
  const current = probe && !probe.error && probe.data ? toRow(probe.data as FeaturedDbRow) : null;
  // Featured work older than the first 100 on the list (or withdrawn since): look it up directly.
  const currentTitle = current
    ? listed.works.find((work) => work.id === current.workId)?.title
      ?? (await findLiveCatalogWork(current.workId).catch(() => null))?.title
      ?? null
    : null;
  return { enabled: listed.enabled, featuredOn, weekStart, works: listed.works, current, currentTitle };
}

export type FeatureOutcome = { ok: true } | { ok: false; code: "INVALID" | "NOT_LIVE" | "OFF" | "FAILED" };

/**
 * Feature a live work for the current Warsaw week (replaces another work featured this week).
 * Re-featuring the same work only updates the note. The author gets one mail per feature row.
 */
export async function featureWorkForWeek(input: { workId: unknown; note?: unknown }): Promise<FeatureOutcome> {
  const context = await requireRole(["ADMIN"]);
  if (typeof input.workId !== "string" || !isUuid(input.workId)) return { ok: false, code: "INVALID" };
  const admin = adminOrNull();
  if (!admin) return { ok: false, code: "OFF" };
  const work = await findLiveCatalogWork(input.workId).catch(() => null);
  if (!work) return { ok: false, code: "NOT_LIVE" };
  const weekStart = warsawWeekStart(new Date());
  const note = cleanFeaturedNote(input.note);

  const existing = await admin.from(TABLE).select("id, work_id, week_start, note").eq("week_start", weekStart).maybeSingle();
  if (existing.error) return { ok: false, code: existing.error.code === "PGRST205" || existing.error.code === "42P01" ? "OFF" : "FAILED" };
  const prev = existing.data as FeaturedDbRow | null;

  let rowId: string;
  if (prev && prev.work_id === work.id) {
    const saved = await admin.from(TABLE).update({ note }).eq("id", prev.id);
    if (saved.error) return { ok: false, code: "FAILED" };
    rowId = prev.id;
  } else {
    const saved = await admin
      .from(TABLE)
      .upsert(
        { week_start: weekStart, work_id: work.id, note, created_by: context.userId, created_at: new Date().toISOString(), notified_at: null },
        { onConflict: "week_start" },
      )
      .select("id")
      .single();
    if (saved.error || !saved.data) return { ok: false, code: "FAILED" };
    rowId = (saved.data as { id: string }).id;
  }

  const ownerId = work.ownerId;
  const workId = work.id;
  const workTitle = work.title;
  after(async () => {
    await notifyFeaturedAuthor(rowId, ownerId, workId, workTitle);
  });
  return { ok: true };
}

/** Cancel this week's feature of `workId` (no-op when another work or nothing is featured). */
export async function unfeatureWorkForWeek(workId: unknown): Promise<FeatureOutcome> {
  await requireRole(["ADMIN"]);
  if (typeof workId !== "string" || !isUuid(workId)) return { ok: false, code: "INVALID" };
  const admin = adminOrNull();
  if (!admin) return { ok: false, code: "OFF" };
  const removed = await admin.from(TABLE).delete().eq("week_start", warsawWeekStart(new Date())).eq("work_id", workId);
  if (removed.error) return { ok: false, code: "FAILED" };
  return { ok: true };
}

/** Atomic claim of notified_at, then the mail (respects preferences / unsubscribe in sendNotification). */
async function notifyFeaturedAuthor(rowId: string, ownerId: string, workId: string, workTitle: string): Promise<void> {
  try {
    const { notifyEnv } = await import("@/lib/email/notify/config");
    if (!notifyEnv(process.env).enabled) return;
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from(TABLE)
      .update({ notified_at: new Date().toISOString() })
      .eq("id", rowId)
      .eq("work_id", workId)
      .is("notified_at", null)
      .select("id");
    if (!data?.length) return;
    const { sendNotification } = await import("@/lib/email/notify/server");
    await sendNotification({ userId: ownerId, kind: "work_featured", data: { workId, workTitle } });
  } catch {
    console.error("[featured-work] notify failed");
  }
}
