/**
 * PREMIUM-06 — Pure stuck-job / retry classification (no remote worker).
 * Aligns with AUDIO_RENDER_MAX_ATTEMPTS + timeout_at semantics.
 */

import { AUDIO_RENDER_MAX_ATTEMPTS } from "@/config/audio-render";

export type WorkerJobView = {
  id: string;
  status: string;
  attempt: number;
  timeoutAtMs: number | null;
  kind: string;
};

export type WorkerRecoveryAction =
  | { action: "NONE" }
  | { action: "REQUEUE"; reason: "TIMEOUT" }
  | { action: "FAIL_TERMINAL"; reason: "MAX_ATTEMPTS" | "TIMEOUT_EXHAUSTED" };

/**
 * Decide recovery for a RUNNING job past timeout_at.
 * Does not mutate DB — caller applies under service_role.
 * SFM kinds should use SFM poller path (caller filters).
 */
export function classifyStuckRenderJob(params: {
  job: WorkerJobView;
  nowMs: number;
  maxAttempts?: number;
}): WorkerRecoveryAction {
  const max = params.maxAttempts ?? AUDIO_RENDER_MAX_ATTEMPTS;
  const { job, nowMs } = params;
  if (job.status !== "RUNNING") return { action: "NONE" };
  if (job.timeoutAtMs == null || job.timeoutAtMs > nowMs) {
    return { action: "NONE" };
  }
  if (job.attempt >= max) {
    return { action: "FAIL_TERMINAL", reason: "TIMEOUT_EXHAUSTED" };
  }
  return { action: "REQUEUE", reason: "TIMEOUT" };
}

export function isSfmExecutorKind(kind: string): boolean {
  return kind.startsWith("SFM_");
}
