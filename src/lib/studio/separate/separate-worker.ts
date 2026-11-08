import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  demucsStemFile,
  SEPARATE_MAX_BYTES,
  separateObjectKey,
  STEM_NAMES,
  type SeparatorWorkerConfig,
  type StemName,
} from "./separate-worker-env";

type RunConfig = Extract<SeparatorWorkerConfig, { action: "run" }>;
export type ClaimedSeparateJob = {
  id: string;
  owner_id: string;
  source_bucket: string;
  source_key: string;
};

const BUCKET = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function claimNextSeparateJob(cfg: RunConfig): Promise<ClaimedSeparateJob | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_next_studio_separate_job", { p_worker_ref: cfg.workerRef });
  if (error) throw new Error(`claim_failed:${error.code ?? "?"}`);
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedSeparateJob | null;
  return row?.id ? row : null;
}

async function complete(cfg: RunConfig, jobId: string, status: "succeeded" | "failed", stems: Record<string, string> | null, errorCode: string | null) {
  const { error } = await createSupabaseAdminClient().rpc("complete_studio_separate_job", {
    p_job_id: jobId,
    p_worker_ref: cfg.workerRef,
    p_status: status,
    p_stems: stems,
    p_error_code: errorCode,
  });
  if (error) throw new Error(`complete_failed:${error.code ?? "?"}`);
}

function runScript(cfg: RunConfig, src: string, outdir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.python, [cfg.scriptPath, src, outdir], {
      env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout"));
    }, cfg.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

/** Claimed job: download the source, run the host script, upload four stems. */
export async function runSeparateJob(cfg: RunConfig, job: ClaimedSeparateJob): Promise<"succeeded" | "failed"> {
  const dir = await mkdtemp(path.join(tmpdir(), "brd-sep-"));
  const uploaded: string[] = [];
  try {
    if (!UUID.test(job.id) || !UUID.test(job.owner_id)) throw new Error("bad_job");
    if (job.source_bucket !== "audio-artifacts" && job.source_bucket !== "beat-audio") throw new Error("bad_bucket");
    if (!job.source_key || job.source_key.includes("..")) throw new Error("bad_key");
    const admin = createSupabaseAdminClient();
    const { data: blob, error } = await admin.storage.from(job.source_bucket).download(job.source_key);
    if (error || !blob) throw new Error("input_missing");
    const src = path.join(dir, "source.wav");
    const outdir = path.join(dir, "out");
    await writeFile(src, Buffer.from(await blob.arrayBuffer()));
    const code = await runScript(cfg, src, outdir);
    if (code === 3) throw new Error("separator_unconfigured");
    if (code !== 0) throw new Error("demucs_failed");
    const stems: Record<string, string> = {};
    for (const name of STEM_NAMES) {
      const file = demucsStemFile(outdir, "source", name);
      const info = await stat(file).catch(() => null);
      if (!info || info.size <= 44 || info.size > SEPARATE_MAX_BYTES) throw new Error(info && info.size > SEPARATE_MAX_BYTES ? "too_large" : "stems_missing");
      const key = separateObjectKey(job.owner_id, job.id, name as StemName);
      const { error: upErr } = await admin.storage.from(BUCKET).upload(key, await readFile(file), { contentType: "audio/wav", upsert: true });
      if (upErr) throw new Error("upload_failed");
      uploaded.push(key);
      stems[name] = key;
    }
    await complete(cfg, job.id, "succeeded", stems, null);
    return "succeeded";
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 60) : "unknown";
    if (uploaded.length > 0) {
      await createSupabaseAdminClient().storage.from(BUCKET).remove(uploaded).catch(() => undefined);
    }
    await complete(cfg, job.id, "failed", null, code).catch(() => undefined);
    return "failed";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
