import "server-only";

/**
 * Stage 3 — Mastering + delivery server logic (service_role, owner-checked).
 * Two-phase uploads: `prepare` returns a fresh job id + signed upload URL for the
 * browser-rendered input; `commit` re-checks policy, consumes quota and queues the job.
 * Missing tables (migration not applied) → `{ available: false }`.
 */
import { randomUUID } from "node:crypto";

import { AuthError } from "@/lib/auth/session";
import { decideDeliver, DELIVER_WEEKLY_LIMIT, type DeliverFormat, type DeliverKind } from "@/lib/studio/deliver/policy";
import { clampMasterSettings, isMasterTargetId } from "@/lib/studio/master/targets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { outputExt, studioMasterJobPrefix, type StudioMasterJobKind, type StudioMasterOutputFormat } from "./job-plan";

const BUCKET = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof createSupabaseAdminClient>;

export class StudioMasterUnavailable extends Error {}
const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");
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

async function signedUpload(admin: Admin, key: string) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) throw new Error("sign_upload_failed");
  return { uploadUrl: data.signedUrl, uploadToken: data.token, path: key };
}

async function inputExists(admin: Admin, prefix: string, stems: boolean): Promise<boolean> {
  const { data } = await admin.storage.from(BUCKET).list(stems ? `${prefix}/in/stems` : `${prefix}/in`, { limit: 64 });
  return !!data?.some((f) => (stems ? /\.wav$/i.test(f.name) : f.name === "source.wav"));
}

export type MasterJobView = {
  id: string; kind: StudioMasterJobKind; status: string; target: string | null; outputFormat: StudioMasterOutputFormat;
  metrics: unknown; errorCode: string | null; approvedAt: string | null; createdAt: string;
};
const view = (r: Record<string, unknown>): MasterJobView => ({
  id: String(r.id), kind: r.kind as StudioMasterJobKind, status: String(r.status), target: (r.target as string) ?? null,
  outputFormat: r.output_format as StudioMasterOutputFormat, metrics: r.metrics ?? null, errorCode: (r.error_code as string) ?? null,
  approvedAt: (r.approved_at as string) ?? null, createdAt: String(r.created_at),
});

/** Latest master job (+ approved one) and the Free weekly counter. */
export async function getStudioMasterState(p: { ownerId: string; projectId: string; tier: PremiumTier }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data, error } = await admin.from("studio_master_jobs").select("*").eq("project_id", p.projectId).eq("owner_id", p.ownerId)
    .eq("kind", "master").order("created_at", { ascending: false }).limit(20);
  if (missing(error)) return { available: false as const };
  check(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  const latest = rows[0] ? view(rows[0]) : null;
  const approved = rows.find((r) => r.approved_at) ?? null;
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
  return { available: true as const, latest, approved: approved ? view(approved) : null, usage: { used, weekLimit: limit, resetAt } };
}

/** Phase 1 of a master: job id + upload URL for the approved mix (browser-rendered WAV). */
export async function prepareStudioMaster(p: { ownerId: string; projectId: string }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const jobId = randomUUID();
  return { jobId, ...(await signedUpload(admin, `${studioMasterJobPrefix(p.ownerId, p.projectId, jobId)}/in/source.wav`)) };
}

export async function commitStudioMaster(p: { ownerId: string; projectId: string; jobId: string; target: unknown; settings: unknown }) {
  if (!UUID.test(p.jobId) || !isMasterTargetId(p.target)) throw new AuthError("FORBIDDEN", "bad_request");
  const admin = createSupabaseAdminClient();
  const { documentVersion } = await assertOwner(admin, p.ownerId, p.projectId);
  const prefix = studioMasterJobPrefix(p.ownerId, p.projectId, p.jobId);
  if (!(await inputExists(admin, prefix, false))) return { ok: false as const, error: "input_missing" };
  const { error } = await admin.from("studio_master_jobs").insert({
    id: p.jobId, project_id: p.projectId, owner_id: p.ownerId, kind: "master", target: p.target,
    settings: clampMasterSettings((p.settings ?? {}) as Record<string, number>), source_document_version: documentVersion, output_format: "WAV_FLOAT",
  });
  check(error);
  return { ok: true as const, jobId: p.jobId };
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

/** Deliver phase 1: policy check (no quota yet) + upload URL for browser-rendered inputs. */
export async function prepareStudioDeliver(p: { ownerId: string; projectId: string; tier: PremiumTier; kind: unknown; format: unknown }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  const d = decideDeliver({ tier: p.tier, kind: p.kind, format: p.format, approved: !!approved });
  if (!d.allowed) return { ok: false as const, error: d.reason };
  const jobId = randomUUID();
  const prefix = studioMasterJobPrefix(p.ownerId, p.projectId, jobId);
  if (p.kind === "master") return { ok: true as const, jobId, upload: null };
  // Projekt: stems are signed one by one via signStudioStemUpload.
  if (p.kind === "project") return { ok: true as const, jobId, upload: null };
  return { ok: true as const, jobId, upload: await signedUpload(admin, `${prefix}/in/source.wav`) };
}

/** Signed upload for one stem of a Projekt zip (name = NN-safe.wav). */
export async function signStudioStemUpload(p: { ownerId: string; projectId: string; jobId: string; name: string }) {
  if (!UUID.test(p.jobId) || !/^\d{2}-[a-z0-9_-]{1,40}\.wav$/.test(p.name)) throw new AuthError("FORBIDDEN", "bad_request");
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  return signedUpload(admin, `${studioMasterJobPrefix(p.ownerId, p.projectId, p.jobId)}/in/stems/${p.name}`);
}

async function approvedMaster(admin: Admin, ownerId: string, projectId: string) {
  const { data, error } = await admin.from("studio_master_jobs").select("id, result_object_key").eq("project_id", projectId).eq("owner_id", ownerId)
    .eq("kind", "master").not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle();
  check(error);
  return data as { id: string; result_object_key: string | null } | null;
}

/** Deliver phase 2: re-check, consume quota atomically, queue the job. */
export async function commitStudioDeliver(p: { ownerId: string; projectId: string; tier: PremiumTier; jobId: string; kind: unknown; format: unknown }) {
  if (!UUID.test(p.jobId)) throw new AuthError("FORBIDDEN", "bad_request");
  const admin = createSupabaseAdminClient();
  const { documentVersion } = await assertOwner(admin, p.ownerId, p.projectId);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  const d = decideDeliver({ tier: p.tier, kind: p.kind, format: p.format, approved: !!approved });
  if (!d.allowed) return { ok: false as const, error: d.reason };
  const kind = p.kind as DeliverKind;
  const format = p.format as DeliverFormat;
  const prefix = studioMasterJobPrefix(p.ownerId, p.projectId, p.jobId);
  if (kind === "master") {
    if (!approved?.result_object_key) return { ok: false as const, error: "not_approved" };
    const { error } = await admin.storage.from(BUCKET).copy(approved.result_object_key, `${prefix}/in/source.wav`);
    if (error) throw new Error("copy_failed");
  } else if (!(await inputExists(admin, prefix, kind === "project"))) {
    return { ok: false as const, error: "input_missing" };
  }
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

/** Job status; signed download URL (10 min) once succeeded. */
export async function getStudioJob(p: { ownerId: string; projectId: string; jobId: string; filename: string }) {
  if (!UUID.test(p.jobId)) throw new AuthError("NOT_FOUND", "not_found");
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data, error } = await admin.from("studio_master_jobs").select("*").eq("id", p.jobId).eq("owner_id", p.ownerId).eq("project_id", p.projectId).maybeSingle();
  check(error);
  if (!data) throw new AuthError("NOT_FOUND", "not_found");
  const row = data as Record<string, unknown>;
  let downloadUrl: string | null = null;
  if (row.status === "succeeded" && typeof row.result_object_key === "string") {
    const ext = outputExt(row.output_format as StudioMasterOutputFormat);
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(row.result_object_key, 600, { download: `${p.filename}.${ext}` });
    downloadUrl = s?.signedUrl ?? null;
  }
  return { job: view(row), downloadUrl };
}
