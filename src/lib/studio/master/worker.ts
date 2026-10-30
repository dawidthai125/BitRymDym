import "server-only";

/**
 * Studio master worker (E3 host, service_role): claim → render the mix on E3 from
 * the sources in storage (same TS DSP as the browser preview, see server-render.ts)
 * → python master.py (pedalboard/pyloudnorm, separate GPL process) → ffmpeg export →
 * upload to audio-artifacts → complete RPC. The browser uploads nothing.
 * Outputs > 40 MB (WAV 24 / ZIP of a 4-min song) are stored as ordered byte parts
 * (Supabase 50 MB object cap) and joined in the browser. Logs never include URLs or keys.
 */
import { spawn } from "node:child_process";
import { appendFile, copyFile, mkdir, mkdtemp, open, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { notifyStudioJobReady } from "@/lib/email/notify/server";
import { renderYoutubeVideo } from "@/lib/studio/video/render";
import { isYoutubeVideoSpec } from "@/lib/studio/video/youtube-video";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { outputExt, planStudioMasterJob, studioMasterJobPrefix, type StudioMasterJobKind, type StudioMasterOutputFormat } from "./job-plan";
import { partCount, partName, partsOf, PART_BYTES } from "./parts";
import { studioJobProgress, type StudioJobStage } from "./progress";
import { REFERENCE_COLUMNS, deleteStudioReferenceById, type StudioReferenceRow } from "./reference-store";
import { renderMixStereo } from "./render-mix";
import { renderMixStereoParallel } from "./render-mix-parallel";
import { stemFileName } from "./render-io";
import { assertServerDocVersion, loadServerMixInput, writeWavFloat } from "./server-render";
import type { StudioMasterWorkerConfig } from "./worker-env";

type RunConfig = Extract<StudioMasterWorkerConfig, { action: "run" }>;
export type ClaimedMasterJob = {
  id: string; project_id: string; owner_id: string; kind: StudioMasterJobKind; target: string | null;
  settings: Record<string, number>; output_format: StudioMasterOutputFormat;
  source_document_version: number; source_artifact_id: string | null;
  style?: string | null; style_intensity?: number | null; reference_id?: string | null; reference_intensity?: number | null;
  /** Gold YouTube MP4 spec (youtube_video jobs only). */
  video?: unknown;
};

const BUCKET = "audio-artifacts";

/**
 * Local (E3 disk) cache of the rendered pre-master mix per project document version:
 * master → mix WAV/MP3 deliveries and re-masters at the same version reuse it instead
 * of re-rendering. Bump MIX_CACHE_TAG whenever the render DSP changes. Entries expire
 * after MIX_CACHE_TTL_MS; total size is capped.
 */
const MIX_CACHE_TAG = "r1";
const MIX_CACHE_TTL_MS = 12 * 3600_000;
const MIX_CACHE_MAX_BYTES = 3 * 1024 ** 3;

function mixCacheDir(): string {
  return process.env.STUDIO_MASTER_MIX_CACHE_DIR || path.join(homedir(), ".cache", "studio-mix");
}

function mixCacheFile(job: ClaimedMasterJob): string {
  // ids are validated uuids (studioMasterJobPrefix) — safe as a file name.
  return path.join(mixCacheDir(), `${job.owner_id}_${job.project_id}_v${Number(job.source_document_version)}_${MIX_CACHE_TAG}.wav`);
}

async function mixCacheHit(job: ClaimedMasterJob): Promise<string | null> {
  const f = mixCacheFile(job);
  try {
    const st = await stat(f);
    if (Date.now() - st.mtimeMs > MIX_CACHE_TTL_MS) return null;
    const now = new Date();
    await utimes(f, now, now);
    return f;
  } catch {
    return null;
  }
}

async function mixCacheStore(job: ClaimedMasterJob, file: string): Promise<void> {
  try {
    const dir = mixCacheDir();
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const dst = mixCacheFile(job);
    await copyFile(file, `${dst}.tmp`);
    await rm(dst, { force: true });
    await copyFile(`${dst}.tmp`, dst);
    await rm(`${dst}.tmp`, { force: true });
    // Prune: expired first, then oldest until under the size cap.
    const entries = await Promise.all((await readdir(dir)).filter((n) => n.endsWith(".wav")).map(async (n) => {
      const st = await stat(path.join(dir, n));
      return { f: path.join(dir, n), m: st.mtimeMs, size: st.size };
    }));
    entries.sort((a, b) => b.m - a.m);
    let total = 0;
    for (const e of entries) {
      total += e.size;
      if (Date.now() - e.m > MIX_CACHE_TTL_MS || total > MIX_CACHE_MAX_BYTES) await rm(e.f, { force: true });
    }
  } catch {
    /* cache is best effort */
  }
}

export async function claimNextStudioMasterJob(cfg: RunConfig): Promise<ClaimedMasterJob | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_next_studio_master_job", { p_worker_ref: cfg.workerRef });
  if (error) throw new Error(`claim_failed:${error.code ?? "?"}`);
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedMasterJob | null;
  return row?.id ? row : null;
}

/**
 * Live progress → the job row (owner sees it via RLS select). Throttled, serialized,
 * best effort: a failed progress write never fails the job; only while still running.
 */
function progressReporter(job: ClaimedMasterJob, workerRef: string) {
  const fromMaster = job.kind === "transcode" && !!job.source_artifact_id;
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  let lastStage: StudioJobStage | null = null;
  let lastPct = -1;
  const report = (stage: StudioJobStage, fraction = 0) => {
    const pct = studioJobProgress(job.kind, fromMaster, stage, fraction, !!job.reference_id);
    const now = Date.now();
    if (stage === lastStage && (pct <= lastPct || now - lastAt < 1200)) return;
    lastAt = now;
    lastStage = stage;
    lastPct = Math.max(lastPct, pct);
    const row = { stage, progress: lastPct, progress_at: new Date(now).toISOString() };
    chain = chain.then(() =>
      createSupabaseAdminClient().from("studio_master_jobs").update(row).eq("id", job.id).eq("worker_ref", workerRef).eq("status", "running"),
    ).catch(() => {});
  };
  return { report, flush: () => chain };
}

function runPython(cfg: RunConfig, args: string[], onProgress?: (fraction: number) => void): Promise<{ code: number; json: Record<string, unknown> | null }> {
  return new Promise((resolve) => {
    const child = spawn(cfg.pythonBin, [cfg.masterScript, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), cfg.timeoutMs);
    child.stdout.on("data", (b: Buffer) => { if (out.length < 65536) out += b.toString("utf8"); });
    // master.py prints "progress <0..1>" lines on stderr; anything else there is dropped.
    child.stderr.on("data", (b: Buffer) => {
      err = (err + b.toString("utf8")).slice(-4096);
      const lines = err.split("\n");
      err = lines.pop() ?? "";
      for (const l of lines) {
        const m = /^progress ([0-9.]+)$/.exec(l.trim());
        if (m && onProgress) onProgress(Number(m[1]));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let json: Record<string, unknown> | null = null;
      try { json = JSON.parse(out.trim().split("\n").pop() ?? ""); } catch { json = null; }
      resolve({ code: code ?? 1, json });
    });
  });
}

async function listNames(dir: string): Promise<string[]> {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).list(dir, { limit: 1000 });
  if (error) throw new Error("input_missing");
  return (data ?? []).map((f) => f.name);
}

/** Download `dir/base` — whole object or its ordered .pNNN parts — into `file`. */
async function download(dir: string, base: string, file: string, names?: string[]) {
  const parts = partsOf(names ?? (await listNames(dir)), base);
  if (!parts.length) throw new Error("input_missing");
  await writeFile(file, Buffer.alloc(0));
  for (const n of parts) {
    const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(`${dir}/${n}`);
    if (error || !data) throw new Error("input_missing");
    await appendFile(file, Buffer.from(await data.arrayBuffer()));
  }
}

/** Upload `file` as `key`, or as ≤40 MB `key.pNNN` parts when larger (Supabase 50 MB cap). */
async function uploadFile(key: string, file: string, contentType: string, onProgress?: (fraction: number) => void) {
  const size = (await stat(file)).size;
  const n = partCount(size);
  const fh = await open(file, "r");
  try {
    for (let i = 0; i < n; i++) {
      const len = Math.min(PART_BYTES, size - i * PART_BYTES);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, i * PART_BYTES);
      const { error } = await createSupabaseAdminClient().storage.from(BUCKET).upload(n === 1 ? key : partName(key, i), buf, { contentType, upsert: true });
      if (error) throw new Error("upload_failed");
      onProgress?.((i + 1) / n);
    }
  } finally {
    await fh.close();
  }
  return n;
}

/** YouTube video image: a beat cover (beat-covers) or the owner's filtered upload (audio-artifacts). */
async function downloadVideoImage(job: ClaimedMasterJob, dir: string): Promise<{ file: string; title: string | null; artist: string | null }> {
  const spec = job.video;
  if (!isYoutubeVideoSpec(spec)) throw new Error("video_spec_invalid");
  // Own uploads live under the job owner's prefix only.
  if (spec.image.bucket === "audio-artifacts" && !spec.image.key.startsWith(`studio-video/${job.owner_id}/${job.project_id}/`)) throw new Error("video_spec_invalid");
  const { data, error } = await createSupabaseAdminClient().storage.from(spec.image.bucket).download(spec.image.key);
  if (error || !data) throw new Error("video_image_missing");
  const file = path.join(dir, `image${path.extname(spec.image.key) || ".img"}`);
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
  return { file, title: spec.title, artist: spec.artist };
}

/**
 * Reference mastering: the job's uploaded reference (same owner + project, ready, not
 * expired) → E3 disk → ffmpeg decode to 16-bit 44.1 kHz stereo WAV (≤ 10:01; master.py
 * rejects > 10:00). master.py streams it from disk, so its length barely costs memory.
 */
async function fetchReference(cfg: RunConfig, job: ClaimedMasterJob, referenceId: string, dir: string, onProgress: (f: number) => void): Promise<string> {
  const { data } = await createSupabaseAdminClient().from("studio_master_references").select(REFERENCE_COLUMNS).eq("id", referenceId).maybeSingle();
  const row = data as StudioReferenceRow | null;
  if (!row || row.owner_id !== job.owner_id || row.project_id !== job.project_id || row.status !== "ready" || Date.parse(row.expires_at) < Date.now()) throw new Error("reference_missing");
  const k = row.object_key;
  const src = path.join(dir, `reference-src.${row.format}`);
  await download(k.slice(0, k.lastIndexOf("/")), k.slice(k.lastIndexOf("/") + 1), src).catch(() => { throw new Error("reference_missing"); });
  onProgress(0.6);
  const wav = path.join(dir, "reference.wav");
  try {
    await runCapture(resolveFfmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-t", "601", "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", "-f", "wav", wav], { timeoutMs: Math.min(cfg.timeoutMs, 120_000) });
  } catch {
    throw new Error("reference_unreadable");
  }
  await rm(src, { force: true });
  onProgress(1);
  return wav;
}

export async function runStudioMasterJob(cfg: RunConfig, job: ClaimedMasterJob): Promise<"succeeded" | "failed"> {
  const admin = createSupabaseAdminClient();
  const dir = await mkdtemp(path.join(tmpdir(), "studio-master-"));
  let status: "succeeded" | "failed" = "failed";
  let resultKey: string | null = null;
  let metrics: Record<string, unknown> | null = null;
  let errorCode: string | null = null;
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const progress = progressReporter(job, cfg.workerRef);
  try {
    const prefix = studioMasterJobPrefix(job.owner_id, job.project_id, job.id);
    const steps = planStudioMasterJob(job);
    // Master preview/result is kept as 24-bit FLAC (lossless, fits the 50 MB cap for 4 min).
    const ext = job.kind === "master" ? "flac" : outputExt(job.output_format);
    const out = path.join(dir, `out.${ext}`);
    let cur: string;
    if ((job.kind === "transcode" || job.kind === "youtube_video") && job.source_artifact_id) {
      // Master delivery: the approved E3 master of this project.
      const { data: src } = await admin.from("studio_master_jobs").select("result_object_key, owner_id, project_id, status, kind")
        .eq("id", job.source_artifact_id).maybeSingle();
      const row = src as { result_object_key: string | null; owner_id: string; project_id: string; status: string; kind: string } | null;
      if (!row?.result_object_key || row.owner_id !== job.owner_id || row.project_id !== job.project_id || row.status !== "succeeded" || row.kind !== "master") throw new Error("input_missing");
      const k = row.result_object_key;
      cur = path.join(dir, `approved${path.extname(k)}`);
      progress.report("download");
      await download(k.slice(0, k.lastIndexOf("/")), k.slice(k.lastIndexOf("/") + 1), cur);
    } else {
      // Full mix (master / mix delivery): reuse this version's rendered mix if E3 has it.
      const mixKind = job.kind === "master" || job.kind === "transcode";
      const cached = mixKind ? await mixCacheHit(job) : null;
      if (cached) {
        await assertServerDocVersion({ ownerId: job.owner_id, projectId: job.project_id, expectedVersion: job.source_document_version });
        cur = cached;
        timing.renderMs = 0;
        timing.mixCache = 1;
      } else {
        progress.report("decode");
        const { input, decodeMs } = await loadServerMixInput({ ownerId: job.owner_id, projectId: job.project_id, expectedVersion: job.source_document_version, workDir: dir, timeoutMs: cfg.timeoutMs, onProgress: (f) => progress.report("decode", f) });
        progress.report("render");
        timing.decodeMs = decodeMs;
        const r0 = Date.now();
        if (job.kind === "project_zip") {
          const stemsDir = path.join(dir, "stems");
          await mkdir(stemsDir);
          let n = 0;
          for (const tr of input.tracks) {
            await writeWavFloat(path.join(stemsDir, stemFileName(++n, tr.name)), renderMixStereo(input, { raw: true, normalize: false, onlyTrackId: tr.id }));
            progress.report("render", n / input.tracks.length);
          }
          cur = stemsDir;
        } else {
          cur = path.join(dir, "source.wav");
          // FX chains dominate the CPU → tracks render in parallel worker threads.
          const mix = job.kind === "raw_sum" ? renderMixStereo(input, { raw: true }) : await renderMixStereoParallel(input, {}, undefined, (f) => progress.report("render", f));
          await writeWavFloat(cur, mix);
          if (mixKind) await mixCacheStore(job, cur);
        }
        timing.renderMs = Date.now() - r0;
        timing.lengthMs = input.lengthMs;
        timing.tracks = input.tracks.length;
      }
    }
    for (const s of steps) {
      if (s.op === "python_master") {
        const next = path.join(dir, "mastered.flac");
        const m0 = Date.now();
        const args = ["master", "--in", cur, "--out", next, "--target", s.target, "--settings", JSON.stringify(s.settings ?? {})];
        if (s.reference) {
          progress.report("reference");
          const ref = await fetchReference(cfg, job, s.reference.id, dir, (f) => progress.report("reference", f));
          args.push("--reference", ref, "--reference-intensity", String(s.reference.intensity));
          timing.referenceMs = Date.now() - m0;
        }
        progress.report("master");
        const r = await runPython(cfg, args, (f) => progress.report("master", f));
        if (r.code !== 0 || !r.json?.ok) throw new Error(String(r.json?.error ?? "master_failed").slice(0, 60));
        timing.masterMs = Date.now() - m0;
        metrics = { before: r.json.before, after: r.json.after };
        cur = next;
      } else if (s.op === "python_zip") {
        progress.report("encode");
        const r = await runPython(cfg, ["zip", "--in", cur, "--out", out]);
        if (r.code !== 0 || !r.json?.ok) throw new Error("zip_failed");
        cur = out;
      } else if (s.op === "youtube_video") {
        const img = await downloadVideoImage(job, dir);
        progress.report("download", 1);
        const r = await renderYoutubeVideo({
          dir, image: img.file, audio: cur, out, title: img.title, artist: img.artist, timeoutMs: cfg.timeoutMs,
          onStage: (stage, f) => progress.report(stage, f),
        });
        timing.frameMs = r.frameMs;
        timing.encodeMs = r.encodeMs;
        metrics = { video: { durationS: r.durationS, layout: r.layout, width: 1920, height: 1080 } };
        cur = out;
      } else if (s.op === "ffmpeg") {
        progress.report("encode");
        await runCapture(resolveFfmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", "-i", cur, ...s.args, out], { timeoutMs: cfg.timeoutMs });
        cur = out;
      } else {
        await copyFile(cur, out);
        cur = out;
      }
    }
    resultKey = `${prefix}/out/${job.kind}.${ext}`;
    const contentType = ext === "mp4" ? "video/mp4" : ext === "zip" ? "application/zip" : ext === "mp3" ? "audio/mpeg" : ext === "flac" ? "audio/flac" : "audio/wav";
    progress.report("upload");
    const parts = await uploadFile(resultKey, cur, contentType, (f) => progress.report("upload", f));
    timing.totalMs = Date.now() - t0;
    metrics = { ...(metrics ?? {}), parts, bytes: (await stat(cur)).size, timing, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) };
    status = "succeeded";
  } catch (e) {
    errorCode = (e instanceof Error ? e.message : "unknown").replace(/[^\w:.-]/g, "_").slice(0, 80);
    resultKey = null;
  } finally {
    await rm(dir, { recursive: true, force: true });
    // The reference is private and single-use: gone right after the job (success or not).
    if (job.reference_id) await deleteStudioReferenceById(job.reference_id).catch(() => {});
  }
  await progress.flush();
  if (status === "succeeded") {
    // Final 100 % just before completion (the complete RPC only touches status/result).
    await admin.from("studio_master_jobs").update({ stage: "done", progress: 100, progress_at: new Date().toISOString() })
      .eq("id", job.id).eq("worker_ref", cfg.workerRef).eq("status", "running").then(() => {}, () => {});
  }
  const { error } = await admin.rpc("complete_studio_master_job", {
    p_job_id: job.id, p_worker_ref: cfg.workerRef, p_status: status, p_result_object_key: resultKey, p_metrics: metrics, p_error_code: errorCode,
  });
  if (error) throw new Error(`complete_failed:${error.code ?? "?"}`);
  // "Master / MP4 ready" e-mail (off unless EMAIL_NOTIFICATIONS_ENABLED + Resend env on E3); never fails the job.
  if (status === "succeeded") await notifyStudioJobReady(job).catch(() => {});
  return status;
}
