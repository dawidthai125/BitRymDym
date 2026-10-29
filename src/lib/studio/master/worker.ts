import "server-only";

/**
 * Studio master worker (E3 host, service_role): claim → download inputs →
 * python master.py (pedalboard/pyloudnorm, separate GPL process) → ffmpeg export →
 * upload to audio-artifacts → complete RPC. Logs never include signed URLs or keys.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { outputExt, planStudioMasterJob, studioMasterJobPrefix, type StudioMasterJobKind, type StudioMasterOutputFormat } from "./job-plan";
import type { StudioMasterWorkerConfig } from "./worker-env";

type RunConfig = Extract<StudioMasterWorkerConfig, { action: "run" }>;
export type ClaimedMasterJob = {
  id: string; project_id: string; owner_id: string; kind: StudioMasterJobKind; target: string | null;
  settings: Record<string, number>; output_format: StudioMasterOutputFormat;
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

async function download(key: string, file: string) {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(key);
  if (error || !data) throw new Error("input_missing");
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
}

export async function runStudioMasterJob(cfg: RunConfig, job: ClaimedMasterJob): Promise<"succeeded" | "failed"> {
  const admin = createSupabaseAdminClient();
  const dir = await mkdtemp(path.join(tmpdir(), "studio-master-"));
  let status: "succeeded" | "failed" = "failed";
  let resultKey: string | null = null;
  let metrics: Record<string, unknown> | null = null;
  let errorCode: string | null = null;
  try {
    const prefix = studioMasterJobPrefix(job.owner_id, job.project_id, job.id);
    const steps = planStudioMasterJob(job);
    const out = path.join(dir, `out.${outputExt(job.output_format)}`);
    let cur = path.join(dir, "source.wav");
    if (job.kind === "project_zip") {
      const stemsDir = path.join(dir, "stems");
      await mkdir(stemsDir);
      const { data: list, error } = await admin.storage.from(BUCKET).list(`${prefix}/in/stems`, { limit: 64 });
      if (error || !list?.length) throw new Error("input_missing");
      for (const f of list) if (/^[\w.-]+\.wav$/i.test(f.name)) await download(`${prefix}/in/stems/${f.name}`, path.join(stemsDir, f.name));
      cur = stemsDir;
    } else {
      await download(`${prefix}/in/source.wav`, cur);
    }
    for (const s of steps) {
      if (s.op === "python_master") {
        const next = path.join(dir, "mastered.wav");
        const r = await runPython(cfg, ["master", "--in", cur, "--out", next, "--target", s.target, "--settings", JSON.stringify(s.settings ?? {})]);
        if (r.code !== 0 || !r.json?.ok) throw new Error(String(r.json?.error ?? "master_failed").slice(0, 60));
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
    resultKey = `${prefix}/out/${job.kind}.${outputExt(job.output_format)}`;
    const contentType = job.output_format === "ZIP" ? "application/zip" : job.output_format.startsWith("MP3") ? "audio/mpeg" : "audio/wav";
    const { error: upErr } = await admin.storage.from(BUCKET).upload(resultKey, await readFile(cur), { contentType, upsert: true });
    if (upErr) throw new Error("upload_failed");
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
