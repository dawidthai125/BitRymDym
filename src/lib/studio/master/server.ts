import "server-only";

/**
 * Stage 3 — Mastering + delivery server logic (service_role, owner-checked).
 * Everything is rendered on E3 from the project sources in storage — the browser
 * uploads nothing. `prepare` = policy check + fresh job id; `commit` re-checks policy
 * (and the document version the user previewed), consumes quota and queues the job.
 * Missing tables (migration not applied) → `{ available: false }`.
 */
import { randomUUID } from "node:crypto";

import { AuthError } from "@/lib/auth/session";
import { decideDeliver, DELIVER_WEEKLY_LIMIT, type DeliverFormat, type DeliverKind } from "@/lib/studio/deliver/policy";
import { monthlyMasterLimit, warsawMonthWindow, type MasterQuota } from "@/lib/studio/studio-plan-limits";
import { clampMasterSettings, isMasterTargetId } from "@/lib/studio/master/targets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { downloadFilename, partsOf } from "./parts";
import { outputExt, type StudioMasterJobKind, type StudioMasterOutputFormat } from "./job-plan";
import { isStudioJobStage, type StudioJobStage } from "./progress";

const BUCKET = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof createSupabaseAdminClient>;

export class StudioMasterUnavailable extends Error {}
const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");
/** RPC not deployed yet (plan migration pending) → enforce in the app instead. */
const missingFn = (e: { code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883");

/** Masters this calendar month (Europe/Warsaw); failed/cancelled do not count. */
async function masterMonthUsage(admin: Admin, ownerId: string, tier: PremiumTier): Promise<MasterQuota> {
  const { startIso, resetIso } = warsawMonthWindow(new Date());
  const { count, error } = await admin.from("studio_master_jobs").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).eq("kind", "master").gte("created_at", startIso).not("status", "in", "(failed,cancelled)");
  check(error);
  return { used: count ?? 0, monthLimit: monthlyMasterLimit(tier), resetAt: resetIso };
}
function check(e: { code?: string; message?: string } | null) {
  if (!e) return;
  if (missing(e)) throw new StudioMasterUnavailable("tables_missing");
  throw new Error(e.message ?? "db_error");
}

async function assertOwner(admin: Admin, ownerId: string, projectId: string): Promise<{ documentVersion: number }> {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id, document_version").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  return { documentVersion: Number((data as { document_version?: number }).document_version ?? 0) };
}

async function listNames(admin: Admin, dir: string): Promise<string[]> {
  const { data } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
  return (data ?? []).map((f) => f.name);
}

/** Full keys making up `key` (whole object or its .pNNN parts), in order. */
async function objectParts(admin: Admin, key: string): Promise<string[]> {
  const i = key.lastIndexOf("/");
  const dir = key.slice(0, i);
  return partsOf(await listNames(admin, dir), key.slice(i + 1)).map((n) => `${dir}/${n}`);
}

export type MasterJobView = {
  id: string; kind: StudioMasterJobKind; status: string; target: string | null; outputFormat: StudioMasterOutputFormat;
  metrics: unknown; errorCode: string | null; approvedAt: string | null; createdAt: string;
  settings: Record<string, number> | null;
  /** Live E3 progress (null before the worker picks the job up / old rows). */
  stage: StudioJobStage | null; progress: number | null;
};
const view = (r: Record<string, unknown>): MasterJobView => ({
  id: String(r.id), kind: r.kind as StudioMasterJobKind, status: String(r.status), target: (r.target as string) ?? null,
  outputFormat: r.output_format as StudioMasterOutputFormat, metrics: r.metrics ?? null, errorCode: (r.error_code as string) ?? null,
  approvedAt: (r.approved_at as string) ?? null, settings: (r.settings as Record<string, number>) ?? null, createdAt: String(r.created_at),
  stage: isStudioJobStage(r.stage) ? r.stage : null,
  progress: typeof r.progress === "number" && Number.isFinite(r.progress) ? Math.min(100, Math.max(0, Math.round(r.progress))) : null,
});

/** Latest master job (+ approved one), the download counter and the monthly master quota. */
export async function getStudioMasterState(p: { ownerId: string; projectId: string; tier: PremiumTier }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data, error } = await admin.from("studio_master_jobs").select("*").eq("project_id", p.projectId).eq("owner_id", p.ownerId)
    .eq("kind", "master").order("created_at", { ascending: false }).limit(20);
  if (missing(error)) return { available: false as const };
  check(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  const latest = rows[0] ? view(rows[0]) : null;
  // Only an approval that still matches the current mix counts (same rule as delivery).
  const valid = await approvedMaster(admin, p.ownerId, p.projectId);
  const approved = valid ? rows.find((r) => r.id === valid.id) ?? null : null;
  const limit = DELIVER_WEEKLY_LIMIT[p.tier];
  let used = 0;
  let resetAt: string | null = null;
  if (limit !== null) {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: u, error: ue } = await admin.from("studio_download_usage").select("created_at").eq("owner_id", p.ownerId).gte("created_at", since).order("created_at");
    check(ue);
    used = u?.length ?? 0;
    if (u?.[0]) resetAt = new Date(new Date(String(u[0].created_at)).getTime() + 7 * 864e5).toISOString();
  }
  const masters = await masterMonthUsage(admin, p.ownerId, p.tier);
  return { available: true as const, latest, approved: approved ? view(approved) : null, usage: { used, weekLimit: limit, resetAt }, masters };
}

/** Phase 1 of a master: job id + upload URL for the approved mix (browser-rendered WAV). */
export async function prepareStudioMaster(p: { ownerId: string; projectId: string }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  return { jobId: randomUUID(), uploadUrl: null };
}

/** The browser previewed version `seen`; if the project moved on, the E3 render would differ. */
function versionMismatch(seen: unknown, current: number): boolean {
  return seen !== undefined && seen !== null && Number(seen) !== current;
}

export async function commitStudioMaster(p: { ownerId: string; projectId: string; tier: PremiumTier; jobId: string; target: unknown; settings: unknown; documentVersion?: unknown }) {
  if (!UUID.test(p.jobId) || !isMasterTargetId(p.target)) throw new AuthError("FORBIDDEN", "bad_request");
  const admin = createSupabaseAdminClient();
  const { documentVersion } = await assertOwner(admin, p.ownerId, p.projectId);
  if (versionMismatch(p.documentVersion, documentVersion)) return { ok: false as const, error: "doc_changed" };
  const settings = clampMasterSettings((p.settings ?? {}) as Record<string, number>);
  const monthLimit = monthlyMasterLimit(p.tier);
  // Plan quota (plan-policy mastersPerMonth): atomic check + insert in the DB.
  const { data: q, error: qe } = await admin.rpc("claim_studio_master_job", {
    p_job_id: p.jobId, p_project_id: p.projectId, p_owner_id: p.ownerId, p_target: p.target, p_settings: settings,
    p_source_document_version: documentVersion, p_month_limit: monthLimit,
  });
  if (!missingFn(qe)) {
    check(qe);
    const row = (Array.isArray(q) ? q[0] : q) as { allowed: boolean; used: number; month_limit: number; reset_at: string } | null;
    const masters: MasterQuota = { used: Number(row?.used ?? 0), monthLimit: Number(row?.month_limit ?? monthLimit), resetAt: String(row?.reset_at ?? "") };
    if (!row?.allowed) return { ok: false as const, error: "monthly_limit", masters };
    return { ok: true as const, jobId: p.jobId, masters };
  }
  // Fallback until the migration is applied: same rule, checked in the app (not atomic).
  const before = await masterMonthUsage(admin, p.ownerId, p.tier);
  if (before.used >= before.monthLimit) return { ok: false as const, error: "monthly_limit", masters: before };
  const { error } = await admin.from("studio_master_jobs").insert({
    id: p.jobId, project_id: p.projectId, owner_id: p.ownerId, kind: "master", target: p.target,
    settings, source_document_version: documentVersion, output_format: "WAV_FLOAT",
  });
  check(error);
  return { ok: true as const, jobId: p.jobId, masters: { ...before, used: before.used + 1 } };
}

export async function approveStudioMaster(p: { ownerId: string; projectId: string; jobId: string }) {
  if (!UUID.test(p.jobId)) throw new AuthError("NOT_FOUND", "not_found");
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data, error } = await admin.from("studio_master_jobs").update({ approved_at: new Date().toISOString() })
    .eq("id", p.jobId).eq("project_id", p.projectId).eq("owner_id", p.ownerId).eq("kind", "master").eq("status", "succeeded").select("id").maybeSingle();
  check(error);
  return { ok: !!data };
}

const JOB_FOR: Record<DeliverKind, StudioMasterJobKind> = { mix: "transcode", master: "transcode", raw: "raw_sum", project: "project_zip" };

/** Deliver phase 1: policy check (no quota yet) + job id. */
export async function prepareStudioDeliver(p: { ownerId: string; projectId: string; tier: PremiumTier; kind: unknown; format: unknown }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  const d = decideDeliver({ tier: p.tier, kind: p.kind, format: p.format, approved: !!approved });
  if (!d.allowed) return { ok: false as const, error: d.reason };
  return { ok: true as const, jobId: randomUUID(), upload: null };
}

/** Approved master — only while the project is unchanged since (mix edits ⇒ master again). */
async function approvedMaster(admin: Admin, ownerId: string, projectId: string) {
  const { data: proj } = await admin.from("studio_projects").select("document_version").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  const { data, error } = await admin.from("studio_master_jobs").select("id, result_object_key, source_document_version").eq("project_id", projectId).eq("owner_id", ownerId)
    .eq("kind", "master").not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle();
  check(error);
  const row = data as { id: string; result_object_key: string | null; source_document_version: number } | null;
  if (!row || Number((proj as { document_version?: number } | null)?.document_version ?? -1) !== row.source_document_version) return null;
  return row;
}

/** Deliver phase 2: re-check, consume quota atomically, queue the job. */
export async function commitStudioDeliver(p: { ownerId: string; projectId: string; tier: PremiumTier; jobId: string; kind: unknown; format: unknown; documentVersion?: unknown }) {
  if (!UUID.test(p.jobId)) throw new AuthError("FORBIDDEN", "bad_request");
  const admin = createSupabaseAdminClient();
  const { documentVersion } = await assertOwner(admin, p.ownerId, p.projectId);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  const d = decideDeliver({ tier: p.tier, kind: p.kind, format: p.format, approved: !!approved });
  if (!d.allowed) return { ok: false as const, error: d.reason };
  const kind = p.kind as DeliverKind;
  const format = p.format as DeliverFormat;
  if (kind === "master" && !approved?.result_object_key) return { ok: false as const, error: "not_approved" };
  if (kind !== "master" && versionMismatch(p.documentVersion, documentVersion)) return { ok: false as const, error: "doc_changed" };
  const { data: q, error: qe } = await admin.rpc("consume_studio_download", {
    p_owner_id: p.ownerId, p_project_id: p.projectId, p_kind: kind, p_format: format, p_tier: p.tier, p_week_limit: d.weeklyLimit,
  });
  check(qe);
  const quota = (Array.isArray(q) ? q[0] : q) as { allowed: boolean; used: number; week_limit: number | null; reset_at: string | null };
  if (!quota?.allowed) return { ok: false as const, error: "weekly_limit", usage: quota };
  const { error } = await admin.from("studio_master_jobs").insert({
    id: p.jobId, project_id: p.projectId, owner_id: p.ownerId, kind: JOB_FOR[kind], source_document_version: documentVersion,
    source_artifact_id: kind === "master" ? approved!.id : null, output_format: format as StudioMasterOutputFormat,
  });
  check(error);
  return { ok: true as const, jobId: p.jobId, usage: quota };
}

function deliverLabel(row: Record<string, unknown>): string {
  if (row.kind === "project_zip") return "projekt";
  if (row.kind === "raw_sum") return "goly";
  if (row.kind === "master") return "master";
  return row.source_artifact_id ? "master" : "mix";
}

/** Job status; signed download URL(s) (10 min) once succeeded. Large results come as ordered parts. */
export async function getStudioJob(p: { ownerId: string; projectId: string; jobId: string }) {
  if (!UUID.test(p.jobId)) throw new AuthError("NOT_FOUND", "not_found");
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data: proj } = await admin.from("studio_projects").select("title").eq("id", p.projectId).maybeSingle();
  const { data, error } = await admin.from("studio_master_jobs").select("*").eq("id", p.jobId).eq("owner_id", p.ownerId).eq("project_id", p.projectId).maybeSingle();
  check(error);
  if (!data) throw new AuthError("NOT_FOUND", "not_found");
  const row = data as Record<string, unknown>;
  let downloadUrl: string | null = null;
  let downloadParts: string[] | null = null;
  let filename: string | null = null;
  if (row.status === "succeeded" && typeof row.result_object_key === "string") {
    const fmt = String(row.output_format);
    const ext = /\.(\w+)$/.exec(row.result_object_key)?.[1] ?? outputExt(fmt as StudioMasterOutputFormat);
    filename = downloadFilename((proj as { title?: string } | null)?.title, deliverLabel(row), fmt, ext);
    const keys = await objectParts(admin, row.result_object_key);
    if (keys.length === 1) {
      const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(keys[0], 600, { download: filename });
      downloadUrl = s?.signedUrl ?? null;
    } else if (keys.length > 1) {
      const { data: s } = await admin.storage.from(BUCKET).createSignedUrls(keys, 600);
      downloadParts = (s ?? []).map((x) => x.signedUrl ?? "");
      if (downloadParts.length !== keys.length || downloadParts.some((u) => !u)) downloadParts = null;
    }
  }
  return { job: view(row), downloadUrl, downloadParts, filename };
}
