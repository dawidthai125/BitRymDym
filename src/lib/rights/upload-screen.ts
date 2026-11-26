import "server-only";

/**
 * Upload screen, server side (owner order 2026-11-26). Called by every finalize of an uploaded audio
 * file (takes, stems / "Sam mastering", guest takes) before the file becomes READY, and by the
 * catalogue uploads (beats, samples) before they are stored. See upload-screen-policy.ts.
 */
import { createHash } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  blockCodeForMatch,
  UploadBlockedError,
  type UploadRightsKind,
} from "@/lib/rights/upload-screen-policy";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type UploadScreenKind = "take" | "stem" | "anon_take" | "beat" | "sample";

const missingFn = (e: { code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883");
const missingColumn = (e: { code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || e.code === "42P01" || e.code === "PGRST205");

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Exact-copy check (taken-down files + catalogue beats). Logs a hit in upload_block_events (in the RPC).
 * Throws UploadBlockedError on a hit; the caller removes the object. Returns the SHA-256.
 * Before the migration is applied the RPC is missing: the upload goes on (logged once per call).
 */
export async function assertUploadNotBlocked(p: {
  admin?: Admin;
  bytes: Uint8Array;
  kind: UploadScreenKind;
  ownerId: string | null;
  takeId: string | null;
  /** Catalogue beat allowed in this upload (the project's beat for a stem). */
  allowedBeatId?: string | null;
}): Promise<string> {
  const sha = sha256Hex(p.bytes);
  const admin = p.admin ?? createSupabaseAdminClient();
  const { data, error } = await admin.rpc("check_upload_sha256", {
    p_sha256: sha,
    p_upload_kind: p.kind,
    p_owner_id: p.ownerId,
    p_take_id: p.takeId,
    p_allowed_beat_id: p.allowedBeatId ?? null,
  });
  if (error) {
    if (missingFn(error)) {
      console.warn("[upload-screen] check_upload_sha256 missing (migration not applied)");
      return sha;
    }
    // Fail closed: no READY file without the check.
    throw new Error(`upload_screen_failed:${error.code ?? "?"}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { match_kind?: string | null } | null;
  if (row?.match_kind) throw new UploadBlockedError(blockCodeForMatch(row.match_kind));
  return sha;
}

/** After the exact check passed: store the hash and queue the acoustic screen on the E3 worker. */
export async function queueTakeScreening(admin: Admin, takeId: string, sha: string): Promise<void> {
  const { error } = await admin.from("takes").update({ sha256: sha, screen_status: "pending", screen_claimed_at: null }).eq("id", takeId);
  if (error && !missingColumn(error)) throw new Error(`upload_screen_queue_failed:${error.code ?? "?"}`);
}

/**
 * Store the accepted rights statement for an upload session. Fails closed (the session is refused)
 * unless the table does not exist yet (migration not applied).
 */
export async function recordUploadRightsStatement(admin: Admin, p: {
  userId: string;
  takeId: string;
  projectId: string | null;
  kind: UploadRightsKind;
  version: string;
}): Promise<void> {
  const { error } = await admin.from("upload_rights_statements").insert({
    user_id: p.userId, take_id: p.takeId, project_id: p.projectId, upload_kind: p.kind, statement_version: p.version,
  });
  if (error && !missingColumn(error)) throw new Error(`rights_statement_failed:${error.code ?? "?"}`);
}

/** Add the file's SHA-256 to its rights statement (no statement: nothing to do). */
export async function attachStatementFileHash(admin: Admin, takeId: string, sha: string): Promise<void> {
  const { error } = await admin.from("upload_rights_statements").update({ file_sha256: sha }).eq("take_id", takeId);
  if (error && !missingColumn(error)) console.error("[upload-screen] statement hash not stored", takeId, error.code);
}

/** Staff takedown → blocklist (idempotent). Errors are reported to the caller, the takedown itself stays. */
export async function blockTakenDownAudio(p: {
  kind: "work" | "beat" | "sample";
  sourceId: string;
  reason: string;
  reportId?: string | null;
  actorId: string;
}): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const { data, error } = await createSupabaseAdminClient().rpc("block_audio_source", {
    p_kind: p.kind, p_source_id: p.sourceId, p_reason: p.reason.slice(0, 500) || "Zdjęte z katalogu.",
    p_report_id: p.reportId ?? null, p_actor: p.actorId,
  });
  if (error) return { ok: false, error: missingFn(error) ? "not_migrated" : (error.code ?? "db") };
  return { ok: true, added: Number(data ?? 0) };
}

/**
 * Sample takedown: the catalogue copy (and a platform sample's file) is deleted right after, so the
 * exact hash is taken now; the worker could not read the file later. Best effort (logged).
 */
export async function hashSampleBeforeRemoval(sampleId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: rows } = await admin.from("blocked_audio_fingerprints").select("id, object_key, sha256")
    .eq("source_kind", "sample").eq("source_id", sampleId);
  for (const r of (rows ?? []) as Array<{ id: string; object_key: string | null; sha256: string | null }>) {
    if (r.sha256 || !r.object_key) continue;
    const { data: blob, error } = await admin.storage.from("beat-audio").download(r.object_key);
    if (error || !blob) {
      console.error("[upload-screen] sample file not readable before takedown", sampleId);
      continue;
    }
    const sha = sha256Hex(new Uint8Array(await blob.arrayBuffer()));
    const { error: upErr } = await admin.from("blocked_audio_fingerprints").update({ sha256: sha }).eq("id", r.id);
    if (upErr) console.error("[upload-screen] sample hash not stored", sampleId, upErr.code);
  }
}

/** DB upload-screen gate error (trigger or RPC) → refusal code of the Studio APIs. */
export function uploadGateCode(e: { message?: string } | null): "upload_screening" | "upload_blocked" | null {
  const m = e?.message ?? "";
  if (m.includes("UPLOAD_BLOCKED")) return "upload_blocked";
  if (m.includes("UPLOAD_SCREENING_PENDING")) return "upload_screening";
  return null;
}

/**
 * Files of the project still being screened (or blocked) → refusal code, checked before any quota is used.
 * The same check is a trigger on the job insert (20261126171000). Before the migration: no gate.
 */
export async function projectUploadGate(admin: Admin, projectId: string): Promise<"upload_screening" | "upload_blocked" | null> {
  const { error } = await admin.rpc("upload_screen_gate_project", { p_project_id: projectId });
  if (!error || missingFn(error)) return null;
  const code = uploadGateCode(error);
  if (code) return code;
  throw new Error(`upload_gate_failed:${error.code ?? "?"}`);
}
