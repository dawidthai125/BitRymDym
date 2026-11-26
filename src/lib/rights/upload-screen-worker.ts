import "server-only";

/**
 * Upload-screen worker (E3 Contabo host, service_role). Owner order 2026-11-26.
 * 1) Every new take / stem / guest take (takes.screen_status = pending, set at finalize after the
 *    SHA-256 check) is fingerprinted with Chromaprint and compared with:
 *    - blocked_audio_fingerprints (files taken down from the catalogue) — strict or long match;
 *    - catalogue beats (strict), except the project's / take's beat, copies of it, and the uploader's own beats.
 *    Match → the take is deleted, its object removed and the refusal logged (complete_upload_screening).
 * 2) Taken-down files without a fingerprint yet get one (and their SHA-256) — the backfill and every
 *    takedown whose source was never fingerprinted.
 * Logs never include keys, signed URLs or fingerprints.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CHROMAPRINT_ITEM_SECONDS, compareFingerprints } from "@/lib/beats/auto-check/fingerprint";
import { sameAudioBeatIds } from "@/lib/rights/rights-decision";
import { downloadMaster, downloadTo, fingerprintFile } from "@/lib/rights/rights-worker";
import { decideUploadScreen, type ScreenVerdict } from "@/lib/rights/upload-screen-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type UploadScreenConfig = { fpcalcBin: string; maxDurationSeconds: number; workerRef: string; pollMs: number };

const ALGORITHM = "chromaprint-raw-v1";
const PAGE = 500;
const TAKE_BUCKET = "take-audio";

export function uploadScreenConfig(env: NodeJS.ProcessEnv, pid: number): UploadScreenConfig | null {
  if (env.UPLOAD_SCREEN_ENABLED !== "true") return null;
  const poll = Number(env.UPLOAD_SCREEN_POLL_MS);
  return {
    fpcalcBin: env.FPCALC_BIN ?? "fpcalc",
    maxDurationSeconds: 600,
    workerRef: env.UPLOAD_SCREEN_WORKER_REF || `upload-screen-${pid}`,
    pollMs: Number.isFinite(poll) && poll >= 500 ? poll : 2000,
  };
}

// ---------------------------------------------------------------- references (cached)

type BlockedRef = { id: string; fingerprint: number[]; durationSeconds: number | null };
type BeatRef = { id: string; ownerId: string | null; fingerprint: number[] };

let blockedCache: { at: number; refs: BlockedRef[] } | null = null;
let beatCache: { at: number; refs: BeatRef[] } | null = null;
const BLOCKED_TTL_MS = 30_000;
const BEAT_TTL_MS = 5 * 60_000;

export function resetUploadScreenCaches(): void {
  blockedCache = null;
  beatCache = null;
}

async function blockedRefs(admin: Admin): Promise<BlockedRef[]> {
  if (blockedCache && Date.now() - blockedCache.at < BLOCKED_TTL_MS) return blockedCache.refs;
  const refs: BlockedRef[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("blocked_audio_fingerprints")
      .select("id, fingerprint, duration_seconds").eq("algorithm", ALGORITHM).not("fingerprint", "is", null)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw new Error("blocked_load_failed");
    for (const r of data ?? []) refs.push({ id: String(r.id), fingerprint: r.fingerprint as number[], durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds) });
    if ((data ?? []).length < PAGE) break;
  }
  blockedCache = { at: Date.now(), refs };
  return refs;
}

async function beatRefs(admin: Admin): Promise<BeatRef[]> {
  if (beatCache && Date.now() - beatCache.at < BEAT_TTL_MS) return beatCache.refs;
  const refs: BeatRef[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("beat_audio_fingerprints")
      .select("id, beat_id, fingerprint, beats!inner(owner_id, status)").eq("algorithm", ALGORITHM)
      .in("beats.status", ["APPROVED", "PUBLISHED"]).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error("catalog_load_failed");
    for (const r of data ?? []) {
      const b = (Array.isArray(r.beats) ? r.beats[0] : r.beats) as { owner_id: string | null } | null;
      refs.push({ id: String(r.beat_id), ownerId: b?.owner_id ?? null, fingerprint: r.fingerprint as number[] });
    }
    if ((data ?? []).length < PAGE) break;
  }
  beatCache = { at: Date.now(), refs };
  return refs;
}

// ---------------------------------------------------------------- 1) screen one upload

export type ClaimedScreening = {
  take_id: string; owner_id: string | null; storage_bucket: string; object_key: string; beat_id: string | null;
  stem_project_id: string | null; is_stem: boolean; sha256: string | null; project_beat_id: string | null;
};

export async function claimNextScreening(cfg: UploadScreenConfig): Promise<ClaimedScreening | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_next_upload_screening", { p_worker_ref: cfg.workerRef });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(`screen_claim_failed:${error.code ?? "?"}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedScreening | null;
  return row?.take_id ? row : null;
}

/** Pure judgement of one fingerprint against the references (worker + tests). */
export function judgeUpload(p: {
  print: { raw: number[]; duration: number };
  ownerId: string | null;
  /** The beat the take was recorded on / the stem's project beat: allowed (it bleeds into vocals). */
  allowedBeatId: string | null;
  blocked: BlockedRef[];
  beats: BeatRef[];
}): ScreenVerdict {
  const skip = new Set<string>();
  if (p.allowedBeatId) {
    skip.add(p.allowedBeatId);
    const own = p.beats.find((b) => b.id === p.allowedBeatId);
    if (own) {
      const seconds = own.fingerprint.length * CHROMAPRINT_ITEM_SECONDS;
      for (const id of sameAudioBeatIds({ id: own.id, fingerprint: own.fingerprint, durationSeconds: seconds }, p.beats.map((b) => ({ source: "beat" as const, id: b.id, title: null, fingerprint: b.fingerprint })), compareFingerprints)) skip.add(id);
    }
  }
  return decideUploadScreen({
    uploadSeconds: p.print.duration,
    blocked: p.blocked.map((b) => ({ id: b.id, durationSeconds: b.durationSeconds, ...compareFingerprints(p.print.raw, b.fingerprint) })),
    catalog: p.beats
      .filter((b) => !skip.has(b.id) && (p.ownerId === null || b.ownerId !== p.ownerId))
      .map((b) => ({ beatId: b.id, ...compareFingerprints(p.print.raw, b.fingerprint) })),
  });
}

export async function runScreening(cfg: UploadScreenConfig, job: ClaimedScreening): Promise<string> {
  const admin = createSupabaseAdminClient();
  const work = await mkdtemp(path.join(tmpdir(), "brd-screen-"));
  let verdict: ScreenVerdict;
  try {
    const src = path.join(work, "upload.bin");
    await downloadTo(admin, job.storage_bucket || TAKE_BUCKET, job.object_key, src);
    const print = await fingerprintFile(cfg, work, src);
    verdict = judgeUpload({
      print,
      ownerId: job.owner_id,
      allowedBeatId: job.is_stem ? job.project_beat_id : job.beat_id,
      blocked: await blockedRefs(admin),
      beats: await beatRefs(admin),
    });
  } catch (e) {
    const { data } = await admin.rpc("complete_upload_screening", { p_take_id: job.take_id, p_outcome: "error" });
    console.log(JSON.stringify({ event: "screen_error", takeId: job.take_id, message: e instanceof Error ? e.message.slice(0, 80) : "failed", state: data ?? null }));
    return "error";
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  if (verdict.outcome === "passed") {
    const { data, error } = await admin.rpc("complete_upload_screening", { p_take_id: job.take_id, p_outcome: "passed" });
    if (error) throw new Error(`screen_complete_failed:${error.code ?? "?"}`);
    return String(data ?? "passed");
  }
  const { data, error } = await admin.rpc("complete_upload_screening", {
    p_take_id: job.take_id, p_outcome: "blocked", p_match_kind: verdict.matchKind, p_blocked_id: verdict.blockedId,
    p_catalog_beat_id: verdict.catalogBeatId, p_score: verdict.score, p_matched_seconds: verdict.matchedSeconds,
  });
  if (error) throw new Error(`screen_complete_failed:${error.code ?? "?"}`);
  if (data === "blocked") {
    // DB first (nothing processes it any more), then the file.
    const removed = await admin.storage.from(job.storage_bucket || TAKE_BUCKET).remove([job.object_key]);
    if (!removed.error) await admin.rpc("mark_blocked_take_object_removed", { p_take_id: job.take_id });
  }
  return String(data ?? "blocked");
}

// ---------------------------------------------------------------- 2) fingerprint taken-down files

export async function fillNextBlockedFingerprint(cfg: UploadScreenConfig): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_next_blocked_fingerprint");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(`blocked_claim_failed:${error.code ?? "?"}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; source_kind: string; storage_bucket: string | null; object_key: string | null } | null;
  if (!row?.id || !row.object_key) return null;
  const work = await mkdtemp(path.join(tmpdir(), "brd-blocked-"));
  try {
    const src = path.join(work, "blocked.bin");
    let sha: string | null = null;
    try {
      if (row.source_kind === "work_master") await downloadMaster(admin, row.object_key, src);
      else await downloadTo(admin, row.storage_bucket ?? TAKE_BUCKET, row.object_key, src);
      sha = createHash("sha256").update(await readFile(src)).digest("hex");
      const print = await fingerprintFile(cfg, work, src);
      await admin.rpc("complete_blocked_fingerprint", { p_id: row.id, p_sha256: sha, p_fingerprint: print.raw, p_duration: print.duration, p_error: null });
      blockedCache = null;
      return "ready";
    } catch (e) {
      const code = e instanceof Error ? e.message.slice(0, 80) : "failed";
      await admin.rpc("complete_blocked_fingerprint", { p_id: row.id, p_sha256: sha, p_fingerprint: null, p_duration: null, p_error: code });
      return "error";
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
