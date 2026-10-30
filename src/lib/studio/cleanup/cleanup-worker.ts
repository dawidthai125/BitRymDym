import "server-only";

/**
 * Vocal cleanup worker (E3 host, service_role) — separate from the master worker.
 * claim → re-check the take (owner, READY, not deleted/expired) → download → ffmpeg decode
 * (44.1 kHz float, native channels) → cleanupVocal (own TS DSP) → FLAC 24 → upload to
 * audio-artifacts → complete RPC. Logs never include URLs or keys.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { ffmpegDecodeArgs, parseDecodedWav } from "@/lib/studio/master/render-io";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { cleanupVocal, clampCleanupSettings } from "./cleanup-core";
import { cleanupObjectKey, type StudioCleanupWorkerConfig } from "./cleanup-worker-env";

type RunConfig = Extract<StudioCleanupWorkerConfig, { action: "run" }>;
export type ClaimedCleanupJob = { id: string; owner_id: string; project_id: string; take_id: string; settings: Record<string, unknown> };

const BUCKET = "audio-artifacts";
const SR = 44100;
const MAX_TAKE_SECONDS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function claimNextStudioCleanupJob(cfg: RunConfig): Promise<ClaimedCleanupJob | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_next_studio_cleanup_job", { p_worker_ref: cfg.workerRef });
  if (error) throw new Error(`claim_failed:${error.code ?? "?"}`);
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedCleanupJob | null;
  return row?.id ? row : null;
}

async function complete(cfg: RunConfig, jobId: string, status: "succeeded" | "failed", key: string | null, metrics: unknown, errorCode: string | null) {
  const { error } = await createSupabaseAdminClient().rpc("complete_studio_cleanup_job", {
    p_job_id: jobId, p_worker_ref: cfg.workerRef, p_status: status, p_result_object_key: key, p_metrics: metrics, p_error_code: errorCode,
  });
  if (error) throw new Error(`complete_failed:${error.code ?? "?"}`);
}

/** Planar float channels → interleaved float32 WAV (lossless hand-off to ffmpeg, never uploaded). */
function wavFloat(channels: Float32Array[]): Buffer {
  const nCh = channels.length;
  const n = channels[0]!.length;
  const dataBytes = n * nCh * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii"); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii"); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * nCh * 4, 28); buf.writeUInt16LE(nCh * 4, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36, "ascii"); buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < nCh; c++) buf.writeFloatLE(channels[c]![i]!, 44 + (i * nCh + c) * 4);
  return buf;
}

async function encodeFlac(cfg: Pick<RunConfig, "timeoutMs">, dir: string, channels: Float32Array[]): Promise<string> {
  const wav = path.join(dir, "clean.wav");
  const flac = path.join(dir, "clean.flac");
  await writeFile(wav, wavFloat(channels));
  await runCapture(resolveFfmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-c:a", "flac", "-sample_fmt", "s32", flac], { timeoutMs: cfg.timeoutMs });
  return flac;
}

/** Decode → clean → FLAC inside `dir` (no network; unit-tested with a real ffmpeg). */
export async function cleanTakeFile(cfg: Pick<RunConfig, "timeoutMs">, dir: string, src: string, settings: unknown) {
  const pcm = path.join(dir, "src.wav");
  await runCapture(resolveFfmpegBin(), ffmpegDecodeArgs(src, pcm, SR), { timeoutMs: cfg.timeoutMs });
  const decoded = parseDecodedWav(await readFile(pcm));
  const { channels, metrics } = cleanupVocal(decoded.channels, SR, clampCleanupSettings(settings));
  return { flac: await encodeFlac(cfg, dir, channels), metrics };
}

export async function runStudioCleanupJob(cfg: RunConfig, job: ClaimedCleanupJob): Promise<"succeeded" | "failed"> {
  const dir = await mkdtemp(path.join(tmpdir(), "brd-clean-"));
  try {
    if (![job.id, job.owner_id, job.take_id].every((v) => UUID.test(v))) throw new Error("bad_job");
    const admin = createSupabaseAdminClient();
    const { data: take, error } = await admin.from("takes")
      .select("id, owner_id, status, object_key, storage_bucket, duration_seconds, expires_at, deleted_at").eq("id", job.take_id).maybeSingle();
    if (error) throw new Error("take_lookup");
    const t = take as { owner_id: string; status: string; object_key: string; storage_bucket: string; duration_seconds: number | null; expires_at: string | null; deleted_at: string | null } | null;
    if (!t || t.owner_id !== job.owner_id || t.status !== "READY" || t.deleted_at) throw new Error("take_unavailable");
    if (t.expires_at && Date.parse(t.expires_at) <= Date.now()) throw new Error("take_unavailable");
    if (Number(t.duration_seconds ?? 0) > MAX_TAKE_SECONDS) throw new Error("too_long");
    const { data: blob, error: dlErr } = await admin.storage.from(t.storage_bucket).download(t.object_key);
    if (dlErr || !blob) throw new Error("input_missing");
    const src = path.join(dir, "src");
    await writeFile(src, Buffer.from(await blob.arrayBuffer()));
    const { flac, metrics } = await cleanTakeFile(cfg, dir, src, job.settings);
    const key = cleanupObjectKey(job.owner_id, job.take_id, job.id);
    const { error: upErr } = await admin.storage.from(BUCKET).upload(key, await readFile(flac), { contentType: "audio/flac", upsert: true });
    if (upErr) throw new Error("upload_failed");
    await complete(cfg, job.id, "succeeded", key, metrics, null);
    return "succeeded";
  } catch (e) {
    const code = e instanceof Error ? e.message.slice(0, 60) : "unknown";
    await complete(cfg, job.id, "failed", null, null, code).catch(() => undefined);
    return "failed";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
