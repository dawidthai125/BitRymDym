/**
 * Contabo Continuous Worker V1 — pure qualification helpers (no I/O).
 * OD-CWP-01/02: STUDIO_EXPORT only; MIX / TAKE_EXPORT / unknown OUT.
 */

import { AUDIO_RENDER_MAX_ATTEMPTS } from "@/config/audio-render";
import { isValidRenderJobSourceXor } from "@/lib/audio/render-job-core";

export type PollerQualifyInput = {
  kind: string | null | undefined;
  status: string | null | undefined;
  requestedTier: string | null | undefined;
  projectId: string | null | undefined;
  mixSessionId: string | null | undefined;
  takeId: string | null | undefined;
  attempt: number | null | undefined;
};

export type PollerQualifyResult =
  | { eligible: true }
  | { eligible: false; reason: string };

/** SQL/filter mirror for V1 claim-next eligibility (OD-CWP-01…03). */
export function qualifyStudioExportPollerJob(
  job: PollerQualifyInput,
): PollerQualifyResult {
  if (job.kind !== "STUDIO_EXPORT") {
    return { eligible: false, reason: "KIND_OUT" };
  }
  if (job.status !== "QUEUED") {
    return { eligible: false, reason: "STATUS_NOT_QUEUED" };
  }
  if (job.requestedTier !== "WAV") {
    return { eligible: false, reason: "TIER_UNSUPPORTED" };
  }
  if (
    !isValidRenderJobSourceXor({
      kind: "STUDIO_EXPORT",
      mixSessionId: job.mixSessionId ?? null,
      takeId: job.takeId ?? null,
      projectId: job.projectId ?? null,
    })
  ) {
    return { eligible: false, reason: "SOURCE_XOR" };
  }
  const attempt = job.attempt ?? 0;
  if (attempt < 1 || attempt > AUDIO_RENDER_MAX_ATTEMPTS) {
    return { eligible: false, reason: "ATTEMPT_OUT_OF_RANGE" };
  }
  return { eligible: true };
}

/** Kinds the V1 poller must never claim. */
export function isPollerOutOfScopeKind(kind: string | null | undefined): boolean {
  return kind !== "STUDIO_EXPORT";
}
