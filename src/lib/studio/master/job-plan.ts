/**
 * Stage 3 — Studio master/deliver job planning (pure, shared by API + E3 worker).
 * Storage layout in the private `audio-artifacts` bucket (keys carry no user data
 * besides opaque uuids):
 *   studio-master/{owner}/{project}/{job}/in/source.wav      ← browser-rendered approved mix / raw sum
 *   studio-master/{owner}/{project}/{job}/in/stems/NN.wav    ← dry track stems (Projekt)
 *   studio-master/{owner}/{project}/{job}/out/{kind}.{ext}   ← worker output
 */
import { DELIVER_FFMPEG_ARGS } from "@/lib/studio/deliver/policy";

export const STUDIO_MASTER_JOB_KINDS = ["master", "raw_sum", "project_zip", "transcode"] as const;
export type StudioMasterJobKind = (typeof STUDIO_MASTER_JOB_KINDS)[number];
export const STUDIO_MASTER_OUTPUT_FORMATS = ["WAV_FLOAT", "WAV_24", "MP3_128", "MP3_192", "MP3_320", "ZIP"] as const;
export type StudioMasterOutputFormat = (typeof STUDIO_MASTER_OUTPUT_FORMATS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function studioMasterJobPrefix(ownerId: string, projectId: string, jobId: string): string {
  for (const id of [ownerId, projectId, jobId]) if (!UUID.test(id)) throw new Error("bad_id");
  return `studio-master/${ownerId}/${projectId}/${jobId}`;
}

export const outputExt = (f: StudioMasterOutputFormat) => (f === "ZIP" ? "zip" : f.startsWith("MP3") ? "mp3" : "wav");

export type WorkerStep =
  | { op: "python_master"; target: string; settings: Record<string, number> }
  | { op: "python_zip" }
  | { op: "ffmpeg"; args: string[] }
  | { op: "copy" };

/** What the worker runs for a claimed job, in order. */
export function planStudioMasterJob(job: { kind: StudioMasterJobKind; target: string | null; settings: Record<string, number>; output_format: StudioMasterOutputFormat }): WorkerStep[] {
  if (job.kind === "project_zip") {
    if (job.output_format !== "ZIP") throw new Error("bad_format");
    return [{ op: "python_zip" }];
  }
  if (job.output_format === "ZIP") throw new Error("bad_format");
  const steps: WorkerStep[] = [];
  if (job.kind === "master") {
    if (!job.target) throw new Error("missing_target");
    steps.push({ op: "python_master", target: job.target, settings: job.settings });
  }
  // TP-safe export: master already limits; others are dry sums peak-normalised in the browser.
  steps.push(job.output_format === "WAV_FLOAT" ? { op: "copy" } : { op: "ffmpeg", args: [...DELIVER_FFMPEG_ARGS[job.output_format], "-ar", "48000"] });
  return steps;
}
