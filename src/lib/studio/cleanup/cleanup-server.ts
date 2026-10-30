import "server-only";

/**
 * Gaps P1 #5 — vocal cleanup jobs (service_role, owner-checked).
 * Owner: list / enqueue (daily plan quota via atomic RPC) / apply-unapply / signed preview URL.
 * Render: `applyStudioCleanupOverrides` swaps a take's source for its applied cleaned FLAC.
 * Missing tables (migration not applied) → CleanupUnavailable (UI hides the tool).
 */
import { vocalCleanupPerDayForTier } from "@/config/plan-policy";
import type { AuthorizedRenderSourceRef } from "@/lib/audio/render-source-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { clampCleanupSettings, type CleanupMetrics, type CleanupSettings } from "./cleanup-core";

const BUCKET = "audio-artifacts";
const SIGNED_SECONDS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLS = "id, take_id, status, settings, metrics, error_code, applied, created_at, finished_at";

export class CleanupUnavailable extends Error {}
const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883");
function check(e: { code?: string } | null) {
  if (!e) return;
  if (missing(e)) throw new CleanupUnavailable();
  throw new Error(`cleanup_db:${e.code ?? "?"}`);
}

export type CleanupJobView = {
  id: string; takeId: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  settings: CleanupSettings; metrics: CleanupMetrics | null; errorCode: string | null;
  applied: boolean; createdAt: string; finishedAt: string | null;
};

function view(r: Record<string, unknown>): CleanupJobView {
  return {
    id: String(r.id), takeId: String(r.take_id), status: r.status as CleanupJobView["status"],
    settings: clampCleanupSettings(r.settings), metrics: (r.metrics as CleanupMetrics | null) ?? null,
    errorCode: (r.error_code as string | null) ?? null, applied: Boolean(r.applied),
    createdAt: String(r.created_at), finishedAt: (r.finished_at as string | null) ?? null,
  };
}

/** Start of today in Europe/Warsaw as an ISO instant (same day boundary as the RPC). */
export function warsawDayStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit" })
    .formatToParts(now).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const sinceMidnight = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight).toISOString();
}

async function ownsProject(ownerId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const { data, error } = await createSupabaseAdminClient().from("studio_projects").select("id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("cleanup_project_lookup");
  return !!data;
}

export async function listCleanupJobs(p: { ownerId: string; projectId: string; tier: PremiumTier }) {
  const perDay = vocalCleanupPerDayForTier(p.tier);
  if (!(await ownsProject(p.ownerId, p.projectId))) return { available: true as const, perDay, usedToday: 0, jobs: [] as CleanupJobView[] };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("studio_cleanup_jobs").select(COLS).eq("owner_id", p.ownerId).eq("project_id", p.projectId)
    .order("created_at", { ascending: false }).limit(50);
  check(error);
  const { count, error: cErr } = await admin.from("studio_cleanup_jobs").select("id", { count: "exact", head: true })
    .eq("owner_id", p.ownerId).gte("created_at", warsawDayStartIso()).not("status", "in", "(failed,cancelled)");
  check(cErr);
  return { available: true as const, perDay, usedToday: count ?? 0, jobs: (data ?? []).map(view) };
}

export type EnqueueCleanupResult = { ok: true; job: CleanupJobView } | { ok: false; error: "not_found" | "take_unavailable" | "in_progress" | "daily_limit" };

export async function enqueueCleanupJob(p: { ownerId: string; projectId: string; takeId: string; settings: unknown; tier: PremiumTier }): Promise<EnqueueCleanupResult> {
  if (!UUID.test(p.takeId) || !(await ownsProject(p.ownerId, p.projectId))) return { ok: false, error: "not_found" };
  const admin = createSupabaseAdminClient();
  const { data: take, error } = await admin.from("takes").select("owner_id, status, expires_at, deleted_at").eq("id", p.takeId).maybeSingle();
  if (error) throw new Error("cleanup_take_lookup");
  const t = take as { owner_id: string; status: string; expires_at: string | null; deleted_at: string | null } | null;
  if (!t || t.owner_id !== p.ownerId) return { ok: false, error: "not_found" };
  if (t.status !== "READY" || t.deleted_at || (t.expires_at && Date.parse(t.expires_at) <= Date.now())) return { ok: false, error: "take_unavailable" };
  const { data, error: rErr } = await admin.rpc("enqueue_studio_cleanup_job", {
    p_owner: p.ownerId, p_project: p.projectId, p_take: p.takeId, p_settings: clampCleanupSettings(p.settings), p_per_day: vocalCleanupPerDayForTier(p.tier),
  });
  if (rErr?.message?.includes("CLEANUP_IN_PROGRESS")) return { ok: false, error: "in_progress" };
  if (rErr?.message?.includes("CLEANUP_DAILY_LIMIT")) return { ok: false, error: "daily_limit" };
  check(rErr);
  return { ok: true, job: view((Array.isArray(data) ? data[0] : data) as Record<string, unknown>) };
}

/** Use (jobId) or stop using (null) a cleaned version of a take — one applied per take. */
export async function applyCleanupJob(p: { ownerId: string; takeId: string; jobId: string | null }): Promise<{ ok: boolean }> {
  if (!UUID.test(p.takeId) || (p.jobId !== null && !UUID.test(p.jobId))) return { ok: false };
  const { error } = await createSupabaseAdminClient().rpc("apply_studio_cleanup_job", { p_owner: p.ownerId, p_take: p.takeId, p_job: p.jobId });
  if (error?.message?.includes("CLEANUP_NOT_READY")) return { ok: false };
  check(error);
  return { ok: true };
}

/**
 * Signed URL of the cleaned audio: a specific succeeded job (A/B preview) or, without jobId,
 * the take's applied one. `null` = play the original take.
 */
export async function cleanedSourceUrl(p: { ownerId: string; takeId: string; jobId?: string | null }): Promise<{ jobId: string; url: string } | null> {
  if (!UUID.test(p.takeId) || (p.jobId && !UUID.test(p.jobId))) return null;
  const admin = createSupabaseAdminClient();
  let q = admin.from("studio_cleanup_jobs").select("id, result_object_key").eq("owner_id", p.ownerId).eq("take_id", p.takeId).eq("status", "succeeded");
  q = p.jobId ? q.eq("id", p.jobId) : q.eq("applied", true);
  const { data, error } = await q.maybeSingle();
  if (missing(error)) return null;
  check(error);
  const key = (data as { id: string; result_object_key: string | null } | null);
  if (!key?.result_object_key) return null;
  const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(key.result_object_key, SIGNED_SECONDS);
  if (sErr || !signed?.signedUrl) return null;
  return { jobId: key.id, url: signed.signedUrl };
}

/**
 * Server render hook: point each take that has an applied cleanup at its cleaned FLAC.
 * Takes were already authorised for `ownerId`; the job row must belong to the same owner.
 * Missing table → no-op (feature not deployed).
 */
export async function applyStudioCleanupOverrides(takes: Record<string, AuthorizedRenderSourceRef>, ownerId: string): Promise<void> {
  const ids = Object.keys(takes).filter((id) => UUID.test(id));
  if (ids.length === 0) return;
  const { data, error } = await createSupabaseAdminClient().from("studio_cleanup_jobs").select("take_id, result_object_key")
    .eq("owner_id", ownerId).eq("status", "succeeded").eq("applied", true).in("take_id", ids);
  if (missing(error)) return;
  check(error);
  for (const r of (data ?? []) as { take_id: string; result_object_key: string | null }[]) {
    const ref = takes[r.take_id];
    if (!ref || !r.result_object_key) continue;
    takes[r.take_id] = { ...ref, storageBucket: BUCKET, objectKey: r.result_object_key, contentType: "audio/flac", byteSize: null };
  }
}
