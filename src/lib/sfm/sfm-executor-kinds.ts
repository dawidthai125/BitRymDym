/**
 * SFM Stage C — pure executor kind ↔ domain stage mapping (no I/O).
 * Domain stages remain SFM_MIX / SFM_MASTER only (OD-SFM-ID-07).
 */

import type { SfmExecutorJobKind } from "@/types/domain";
import { SFM_EXECUTOR_JOB_KINDS } from "@/types/domain";
import type { SfmStageKind } from "@/lib/sfm/sfm-domain";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";

export function isSfmExecutorKind(value: unknown): value is SfmExecutorJobKind {
  return (
    typeof value === "string" &&
    (SFM_EXECUTOR_JOB_KINDS as readonly string[]).includes(value)
  );
}

/** Domain stage → executor job kind. */
export function executorKindForSfmStage(
  stageKind: SfmStageKind,
): Exclude<SfmExecutorJobKind, "SFM_QUALITY_ENCODE"> {
  if (stageKind === "SFM_MIX") return "SFM_MIX_PREPARE";
  if (stageKind === "SFM_MASTER") return "SFM_MASTER_BAKE";
  throw new SfmDomainError("Invalid stage kind.", "INVALID");
}

/** Executor job kind → domain stage (QUALITY_ENCODE has no stage). */
export function stageKindForSfmExecutor(
  jobKind: SfmExecutorJobKind,
): SfmStageKind | null {
  if (jobKind === "SFM_MIX_PREPARE") return "SFM_MIX";
  if (jobKind === "SFM_MASTER_BAKE") return "SFM_MASTER";
  return null;
}

/** Job SUCCEEDED alone never completes a stage — complete RPC is required. */
export function jobSucceededImpliesStageComplete(): false {
  return false;
}
