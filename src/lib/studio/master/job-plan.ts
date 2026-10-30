/**
 * Stage 3 — Studio master/deliver job planning (pure, shared by API + E3 worker).
 * The browser uploads nothing: the E3 worker renders the mix / raw sum / stems itself from
 * the takes + beat in storage (same TS DSP as the browser preview, see server-render.ts).
 * Storage layout in the private `audio-artifacts` bucket (keys carry no user data
 * besides opaque uuids):
 *   studio-master/{owner}/{project}/{job}/out/{kind}.{ext}        ← worker output (master: 24-bit FLAC)
 *   studio-master/{owner}/{project}/{job}/out/{kind}.{ext}.pNNN   ← 40 MiB byte parts when > 40 MiB
 *                                                                   (e.g. WAV 24 at 4:00), joined in the browser
 */
import { DELIVER_FFMPEG_ARGS } from "@/lib/studio/deliver/policy";

import { applyMasterStyle, clampIntensity, clampMasterSettings, isMasterStyleId } from "./targets";

export const STUDIO_MASTER_JOB_KINDS = ["master", "raw_sum", "project_zip", "transcode", "youtube_video"] as const;
export type StudioMasterJobKind = (typeof STUDIO_MASTER_JOB_KINDS)[number];
export const STUDIO_MASTER_OUTPUT_FORMATS = ["WAV_FLOAT", "WAV_24", "MP3_128", "MP3_192", "MP3_320", "ZIP", "MP4"] as const;
export type StudioMasterOutputFormat = (typeof STUDIO_MASTER_OUTPUT_FORMATS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function studioMasterJobPrefix(ownerId: string, projectId: string, jobId: string): string {
  for (const id of [ownerId, projectId, jobId]) if (!UUID.test(id)) throw new Error("bad_id");
  return `studio-master/${ownerId}/${projectId}/${jobId}`;
}

export const outputExt = (f: StudioMasterOutputFormat) => (f === "ZIP" ? "zip" : f === "MP4" ? "mp4" : f.startsWith("MP3") ? "mp3" : "wav");

export type WorkerStep =
  /** settings = effective (user settings + style × intensity); reference = job's uploaded reference row. */
  | { op: "python_master"; target: string; settings: Record<string, number>; reference: { id: string; intensity: number } | null }
  | { op: "python_zip" }
  | { op: "ffmpeg"; args: string[] }
  /** Gold YouTube MP4: approved master + image (src/lib/studio/video). */
  | { op: "youtube_video" }
  | { op: "copy" };

/** What the worker runs for a claimed job, in order. */
export type PlannableMasterJob = {
  kind: StudioMasterJobKind; target: string | null; settings: Record<string, number>; output_format: StudioMasterOutputFormat;
  style?: string | null; style_intensity?: number | null; reference_id?: string | null; reference_intensity?: number | null;
};

export function planStudioMasterJob(job: PlannableMasterJob): WorkerStep[] {
  if (job.kind === "project_zip") {
    if (job.output_format !== "ZIP") throw new Error("bad_format");
    return [{ op: "python_zip" }];
  }
  if (job.kind === "youtube_video") {
    if (job.output_format !== "MP4") throw new Error("bad_format");
    return [{ op: "youtube_video" }];
  }
  if (job.output_format === "ZIP" || job.output_format === "MP4") throw new Error("bad_format");
  const steps: WorkerStep[] = [];
  if (job.kind === "master") {
    if (!job.target) throw new Error("missing_target");
    const style = isMasterStyleId(job.style) ? job.style : null;
    const settings = style ? applyMasterStyle(clampMasterSettings(job.settings), style, clampIntensity(job.style_intensity, 0)) : job.settings;
    const reference = job.reference_id && UUID.test(job.reference_id) ? { id: job.reference_id, intensity: clampIntensity(job.reference_intensity, 100) } : null;
    steps.push({ op: "python_master", target: job.target, settings, reference });
  }
  // TP-safe export: master already limits; others are dry sums peak-normalised in the browser.
  steps.push(job.output_format === "WAV_FLOAT" ? { op: "copy" } : { op: "ffmpeg", args: [...DELIVER_FFMPEG_ARGS[job.output_format], "-ar", "48000"] });
  return steps;
}
