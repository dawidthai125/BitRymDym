/**
 * SFM Stage C — pure decision mirrors for start/complete stage↔job hardening (F-01/F-02/F-03).
 * SQL RPC remains authoritative; these guards document and unit-test the contract.
 */

import type { SfmDomainErrorCode } from "@/lib/sfm/sfm-domain";
import { executorKindForSfmStage } from "@/lib/sfm/sfm-executor-kinds";
import type { SfmStageKind } from "@/lib/sfm/sfm-domain";

export type SfmStartStageDecision =
  | { outcome: "IDEMPOTENT_RETURN"; mutatesStage: false }
  | { outcome: "RECOVERY_REQUIRED"; mutatesStage: false; code: "RECOVERY_REQUIRED" }
  | { outcome: "PROCEED_ENQUEUE"; mutatesStage: true }
  | { outcome: "DENY"; mutatesStage: false; code: SfmDomainErrorCode };

export type SfmCompleteStageDecision =
  | { outcome: "IDEMPOTENT_RETURN"; mutatesStage: false }
  | { outcome: "ALLOW"; mutatesStage: true; bindJobId: string | null }
  | { outcome: "DENY"; mutatesStage: false; code: SfmDomainErrorCode };

const ACTIVE_JOB = new Set(["QUEUED", "RUNNING"]);
const TERMINAL_NON_SUCCESS = new Set(["FAILED", "TIMEOUT", "CANCELLED"]);

/** F-02: RUNNING + bound job — active idempotent; terminal / missing => RECOVERY_REQUIRED. */
export function decideSfmStartWithBoundJob(params: {
  stageStatus: string;
  stageJobId: string | null;
  boundJobStatus: string | null;
}): SfmStartStageDecision {
  if (params.stageStatus !== "RUNNING" || params.stageJobId == null) {
    if (
      params.stageStatus === "PENDING" ||
      (params.stageStatus === "RUNNING" && params.stageJobId == null)
    ) {
      return { outcome: "PROCEED_ENQUEUE", mutatesStage: true };
    }
    return {
      outcome: "DENY",
      mutatesStage: false,
      code: "ILLEGAL_TRANSITION",
    };
  }

  if (params.boundJobStatus == null) {
    return {
      outcome: "RECOVERY_REQUIRED",
      mutatesStage: false,
      code: "RECOVERY_REQUIRED",
    };
  }

  if (ACTIVE_JOB.has(params.boundJobStatus)) {
    return { outcome: "IDEMPOTENT_RETURN", mutatesStage: false };
  }

  // SUCCEEDED while stage RUNNING, or FAILED/TIMEOUT/CANCELLED/other — no auto-retry.
  return {
    outcome: "RECOVERY_REQUIRED",
    mutatesStage: false,
    code: "RECOVERY_REQUIRED",
  };
}

export type SfmBoundJobSnapshot = {
  id: string;
  ownerId: string;
  sfmVersionId: string;
  kind: string;
  status: string;
};

/**
 * F-01 / F-03 complete-stage job bind + kind / owner / version checks.
 * Assumes stage is RUNNING (or already terminal for idempotent path).
 */
export function decideSfmCompleteJobBind(params: {
  stageStatus: string;
  stageKind: SfmStageKind;
  stageJobId: string | null;
  pJobId: string | null;
  pStatus: "SUCCEEDED" | "FAILED";
  versionId: string;
  versionOwnerId: string;
  job: SfmBoundJobSnapshot | null;
}): SfmCompleteStageDecision {
  if (
    params.stageStatus === params.pStatus &&
    (params.stageStatus === "SUCCEEDED" || params.stageStatus === "FAILED")
  ) {
    return { outcome: "IDEMPOTENT_RETURN", mutatesStage: false };
  }

  if (params.stageStatus !== "RUNNING") {
    return {
      outcome: "DENY",
      mutatesStage: false,
      code: "ILLEGAL_TRANSITION",
    };
  }

  // F-01: never substitute a different job for the bound one.
  if (
    params.pJobId != null &&
    params.stageJobId != null &&
    params.pJobId !== params.stageJobId
  ) {
    return { outcome: "DENY", mutatesStage: false, code: "CONFLICT" };
  }

  const expectedKind = executorKindForSfmStage(params.stageKind);
  const bindJobId = params.pJobId ?? params.stageJobId;

  if (params.pStatus === "SUCCEEDED") {
    if (params.stageJobId == null) {
      return { outcome: "DENY", mutatesStage: false, code: "INVALID" };
    }
    if (params.pJobId != null && params.pJobId !== params.stageJobId) {
      return { outcome: "DENY", mutatesStage: false, code: "CONFLICT" };
    }

    const job = params.job;
    if (job == null || job.id !== params.stageJobId) {
      return { outcome: "DENY", mutatesStage: false, code: "NOT_FOUND" };
    }
    if (job.ownerId !== params.versionOwnerId) {
      return { outcome: "DENY", mutatesStage: false, code: "NOT_OWNER" };
    }
    if (job.sfmVersionId !== params.versionId) {
      return { outcome: "DENY", mutatesStage: false, code: "NOT_ELIGIBLE" };
    }
    if (job.kind !== expectedKind) {
      return { outcome: "DENY", mutatesStage: false, code: "INVALID" };
    }
    if (job.status !== "SUCCEEDED") {
      return {
        outcome: "DENY",
        mutatesStage: false,
        code: "ILLEGAL_TRANSITION",
      };
    }

    return {
      outcome: "ALLOW",
      mutatesStage: true,
      bindJobId: params.stageJobId,
    };
  }

  // FAILED — optional bind; when present, owner/version/kind must match (F-03).
  if (bindJobId == null) {
    return { outcome: "ALLOW", mutatesStage: true, bindJobId: null };
  }

  const job = params.job;
  if (job == null || job.id !== bindJobId) {
    return { outcome: "DENY", mutatesStage: false, code: "NOT_FOUND" };
  }
  if (job.ownerId !== params.versionOwnerId) {
    return { outcome: "DENY", mutatesStage: false, code: "NOT_OWNER" };
  }
  if (job.sfmVersionId !== params.versionId) {
    return { outcome: "DENY", mutatesStage: false, code: "NOT_ELIGIBLE" };
  }
  if (job.kind !== expectedKind) {
    return { outcome: "DENY", mutatesStage: false, code: "INVALID" };
  }

  return { outcome: "ALLOW", mutatesStage: true, bindJobId };
}

/** True when bound job status must yield RECOVERY_REQUIRED (no auto re-enqueue). */
export function isTerminalBoundJobWithoutAutoRetry(status: string): boolean {
  return status === "SUCCEEDED" || TERMINAL_NON_SUCCESS.has(status);
}
