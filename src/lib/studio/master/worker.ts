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
import { appendFile, copyFile, mkdir, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { outputExt, planStudioMasterJob, studioMasterJobPrefix, type StudioMasterJobKind, type StudioMasterOutputFormat } from "./job-plan";
import { partCount, partName, partsOf, PART_BYTES } from "./parts";
import { renderMixStereo } from "./render-mix";
import { stemFileName } from "./render-io";
import { loadServerMixInput, writeWavFloat } from "./server-render";
import type { StudioMasterWorkerConfig } from "./worker-env";

type RunConfig = Extract<StudioMasterWorkerConfig, { action: "run" }>;
export type ClaimedMasterJob = {
  id: string; project_id: string; owner_id: string; kind: StudioMasterJobKind; target: string | null;
  settings: Record<string, number>; output_format: StudioMasterOutputFormat;
  source_document_version: number; source_artifact_id: string | null;
};

const BUCKET = "audio-artifacts";

export async function claimNextStudioMasterJob(cfg: RunConfig): Promise<ClaimedMasterJob | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_next_studio_master_job", { p_worker_ref: cfg.workerRef });
  if (error) throw new Error(`claim_failed:${error.code ?? "?"}`);
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedMasterJob | null;
  return row?.id ? row : null;
}

function runPython(cfg: RunConfig, args: string[]): Promise<{ code: number; json: Record<string, unknown> | null }> {
  return new Promise((resolve) => {
    const child = spawn(cfg.pythonBin, [cfg.masterScript, ...args], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), cfg.timeoutMs);
    child.stdout.on("data", (b: Buffer) => { if (out.length < 65536) out += b.toString("utf8"); });
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
async function uploadFile(key: string, file: string, contentType: string) {
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
    }
  } finally {
    await fh.close();
  }
  return n;
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
  try {
    const prefix = studioMasterJobPrefix(job.owner_id, job.project_id, job.id);
    const steps = planStudioMasterJob(job);
    // Master preview/result is kept as 24-bit FLAC (lossless, fits the 50 MB cap for 4 min).
    const ext = job.kind === "master" ? "flac" : outputExt(job.output_format);
    const out = path.join(dir, `out.${ext}`);
    let cur: string;
    if (job.kind === "transcode" && job.source_artifact_id) {
      // Master delivery: the approved E3 master of this project.
      const { data: src } = await admin.from("studio_master_jobs").select("result_object_key, owner_id, project_id, status, kind")
        .eq("id", job.source_artifact_id).maybeSingle();
      const row = src as { result_object_key: string | null; owner_id: string; project_id: string; status: string; kind: string } | null;
      if (!row?.result_object_key || row.owner_id !== job.owner_id || row.project_id !== job.project_id || row.status !== "succeeded" || row.kind !== "master") throw new Error("input_missing");
      const k = row.result_object_key;
      cur = path.join(dir, `approved${path.extname(k)}`);
      await download(k.slice(0, k.lastIndexOf("/")), k.slice(k.lastIndexOf("/") + 1), cur);
    } else {
      const { input, decodeMs } = await loadServerMixInput({ ownerId: job.owner_id, projectId: job.project_id, expectedVersion: job.source_document_version, workDir: dir, timeoutMs: cfg.timeoutMs });
      timing.decodeMs = decodeMs;
      const r0 = Date.now();
      if (job.kind === "project_zip") {
        const stemsDir = path.join(dir, "stems");
        await mkdir(stemsDir);
        let n = 0;
        for (const tr of input.tracks) {
          await writeWavFloat(path.join(stemsDir, stemFileName(++n, tr.name)), renderMixStereo(input, { raw: true, normalize: false, onlyTrackId: tr.id }));
        }
        cur = stemsDir;
      } else {
        cur = path.join(dir, "source.wav");
        await writeWavFloat(cur, renderMixStereo(input, job.kind === "raw_sum" ? { raw: true } : {}));
      }
      timing.renderMs = Date.now() - r0;
      timing.lengthMs = input.lengthMs;
      timing.tracks = input.tracks.length;
    }
    for (const s of steps) {
      if (s.op === "python_master") {
        const next = path.join(dir, "mastered.flac");
        const m0 = Date.now();
        const r = await runPython(cfg, ["master", "--in", cur, "--out", next, "--target", s.target, "--settings", JSON.stringify(s.settings ?? {})]);
        if (r.code !== 0 || !r.json?.ok) throw new Error(String(r.json?.error ?? "master_failed").slice(0, 60));
        timing.masterMs = Date.now() - m0;
        metrics = { before: r.json.before, after: r.json.after };
        cur = next;
      } else if (s.op === "python_zip") {
        const r = await runPython(cfg, ["zip", "--in", cur, "--out", out]);
        if (r.code !== 0 || !r.json?.ok) throw new Error("zip_failed");
        cur = out;
      } else if (s.op === "ffmpeg") {
        await runCapture(resolveFfmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", "-i", cur, ...s.args, out], { timeoutMs: cfg.timeoutMs });
        cur = out;
      } else {
        await copyFile(cur, out);
        cur = out;
      }
    }
    resultKey = `${prefix}/out/${job.kind}.${ext}`;
    const contentType = ext === "zip" ? "application/zip" : ext === "mp3" ? "audio/mpeg" : ext === "flac" ? "audio/flac" : "audio/wav";
    const parts = await uploadFile(resultKey, cur, contentType);
    timing.totalMs = Date.now() - t0;
    metrics = { ...(metrics ?? {}), parts, bytes: (await stat(cur)).size, timing, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) };
    status = "succeeded";
  } catch (e) {
    errorCode = (e instanceof Error ? e.message : "unknown").replace(/[^\w:.-]/g, "_").slice(0, 80);
    resultKey = null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const { error } = await admin.rpc("complete_studio_master_job", {
    p_job_id: job.id, p_worker_ref: cfg.workerRef, p_status: status, p_result_object_key: resultKey, p_metrics: metrics, p_error_code: errorCode,
  });
  if (error) throw new Error(`complete_failed:${error.code ?? "?"}`);
  return status;
}
