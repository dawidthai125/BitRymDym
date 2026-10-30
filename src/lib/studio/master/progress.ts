/**
 * E3 job progress — stage names + the share of the bar each stage owns, per job kind.
 * Shared by the worker (writes `stage` / `progress` to studio_master_jobs) and the UI.
 * Weights follow measured E3 timings (4:00 × 8 tracks: render ≈ master.py ≫ decode, upload).
 */
import type { StudioMasterJobKind } from "./job-plan";

/** "reference" = downloading + decoding the uploaded reference track (reference mastering only). */
export const STUDIO_JOB_STAGES = ["queued", "download", "decode", "render", "reference", "master", "encode", "upload", "done"] as const;
export type StudioJobStage = (typeof STUDIO_JOB_STAGES)[number];

export function isStudioJobStage(v: unknown): v is StudioJobStage {
  return typeof v === "string" && (STUDIO_JOB_STAGES as readonly string[]).includes(v);
}

type Plan = Partial<Record<StudioJobStage, number>>;
/** Relative weights (only the stages a kind runs). */
const WEIGHTS: Record<string, Plan> = {
  master: { decode: 8, render: 42, master: 44, upload: 6 },
  // Reference mastering: + download/decode of the reference (a few seconds on E3).
  master_reference: { decode: 8, render: 40, reference: 4, master: 42, upload: 6 },
  transcode_mix: { decode: 10, render: 60, encode: 22, upload: 8 },
  transcode_master: { download: 25, encode: 60, upload: 15 },
  raw_sum: { decode: 20, render: 35, encode: 35, upload: 10 },
  project_zip: { decode: 15, render: 35, encode: 40, upload: 10 },
  // Gold YouTube MP4: fetch master + image, build the frame, H.264/AAC encode dominates.
  youtube_video: { download: 12, render: 4, encode: 74, upload: 10 },
};

function planKey(kind: StudioMasterJobKind, fromApprovedMaster: boolean, withReference: boolean): string {
  if (kind === "transcode") return fromApprovedMaster ? "transcode_master" : "transcode_mix";
  if (kind === "master" && withReference) return "master_reference";
  return kind;
}

/**
 * Overall 0..100 for `stage` at `fraction` (0..1) of it, for this job kind.
 * A mix-cache hit simply jumps over decode/render (the bar moves forward, never back).
 */
export function studioJobProgress(kind: StudioMasterJobKind, fromApprovedMaster: boolean, stage: StudioJobStage, fraction = 0, withReference = false): number {
  if (stage === "queued") return 0;
  if (stage === "done") return 100;
  const plan = WEIGHTS[planKey(kind, fromApprovedMaster, withReference)] ?? WEIGHTS.master;
  const order = STUDIO_JOB_STAGES.filter((s) => plan[s] !== undefined);
  const total = order.reduce((n, s) => n + (plan[s] ?? 0), 0);
  let before = 0;
  for (const s of order) {
    if (s === stage) {
      const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
      return Math.min(99, Math.round(((before + f * (plan[s] ?? 0)) / total) * 100));
    }
    before += plan[s] ?? 0;
  }
  return 0;
}

export type JobProgress = { stage: StudioJobStage; progress: number };

/** Next UI bar state from a polled job view: the % never moves backwards. */
export function jobProgressOf(job: { status?: string; stage?: unknown; progress?: unknown }, prev: JobProgress | null): JobProgress {
  const raw = typeof job.progress === "number" && Number.isFinite(job.progress) ? Math.round(job.progress) : 0;
  const progress = Math.min(100, Math.max(0, raw, prev?.progress ?? 0));
  // Running but no stage yet (worker just claimed it): leave the queue label.
  const fallback: StudioJobStage = prev && prev.stage !== "queued" ? prev.stage : job.status === "running" ? "decode" : "queued";
  const stage: StudioJobStage = isStudioJobStage(job.stage) ? job.stage : fallback;
  return { stage, progress };
}
