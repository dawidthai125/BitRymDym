/**
 * SFM Stage D — pure promote / race / retention presentation guards.
 * SQL RPC sfm_promote_current_artifact remains authoritative for DB atomics.
 * Policy: FIRST_COMMIT_WINS — never demote an existing current READY winner.
 */

import type { SfmDomainErrorCode } from "@/lib/sfm/sfm-domain";
import type { SfmQuality } from "@/lib/sfm/sfm-plan-matrix";

export type SfmPromoteDecision =
  | { outcome: "IDEMPOTENT_ALREADY_CURRENT"; mutatesPointer: false }
  | { outcome: "ALLOW_PROMOTE"; mutatesPointer: true }
  | { outcome: "DENY"; mutatesPointer: false; code: SfmDomainErrorCode };

export type SfmArtifactPromoteView = {
  id: string;
  status: string;
  deletedAt: string | null;
  isCurrent: boolean;
  sfmVersionId: string | null;
  sfmQuality: SfmQuality | null;
  projectId: string | null;
  ownerId: string;
  renderJobId: string;
  byteSize: number | null;
  checksum: string | null;
};

export type SfmJobPromoteView = {
  id: string;
  status: string;
  kind: string;
  ownerId: string;
  projectId: string | null;
  sfmVersionId: string | null;
  sfmQuality: string | null;
};

export type SfmVersionPromoteView = {
  id: string;
  ownerId: string;
  projectId: string;
  status: string;
  expiresAt: string | null;
};

export type SfmGrantPromoteView = {
  userId: string;
  versionId: string;
  grantedQualities: readonly SfmQuality[];
};

/** Upload / insert alone must never flip is_current. */
export function uploadSetsIsCurrent(): false {
  return false;
}

/**
 * Race policy enforced in SQL: first successful promote for (version, quality) wins.
 * Later promotes CONFLICT without demoting the winner.
 */
export function sfmPromoteRaceWinnerPolicy(): "FIRST_COMMIT_WINS" {
  return "FIRST_COMMIT_WINS";
}

export function decideSfmPromote(params: {
  artifact: SfmArtifactPromoteView;
  job: SfmJobPromoteView | null;
  version: SfmVersionPromoteView | null;
  grant: SfmGrantPromoteView | null;
  /** Other READY current for same (version, quality), if any. */
  existingCurrentArtifactId: string | null;
  nowMs: number;
}): SfmPromoteDecision {
  const art = params.artifact;
  if (
    art.isCurrent &&
    art.status === "READY" &&
    art.deletedAt == null
  ) {
    return { outcome: "IDEMPOTENT_ALREADY_CURRENT", mutatesPointer: false };
  }

  if (art.sfmVersionId == null || art.sfmQuality == null) {
    return { outcome: "DENY", mutatesPointer: false, code: "INVALID" };
  }
  if (art.status !== "READY" || art.deletedAt != null) {
    return { outcome: "DENY", mutatesPointer: false, code: "QC_FAILED" };
  }
  if (art.byteSize == null || art.byteSize <= 0 || art.checksum == null) {
    return { outcome: "DENY", mutatesPointer: false, code: "QC_FAILED" };
  }

  const job = params.job;
  if (job == null || job.id !== art.renderJobId) {
    return { outcome: "DENY", mutatesPointer: false, code: "NOT_FOUND" };
  }
  if (job.status !== "SUCCEEDED") {
    return {
      outcome: "DENY",
      mutatesPointer: false,
      code: "ILLEGAL_TRANSITION",
    };
  }
  if (job.kind !== "SFM_QUALITY_ENCODE") {
    return { outcome: "DENY", mutatesPointer: false, code: "INVALID" };
  }
  if (job.ownerId !== art.ownerId) {
    return { outcome: "DENY", mutatesPointer: false, code: "NOT_OWNER" };
  }
  if (
    job.sfmVersionId !== art.sfmVersionId ||
    job.sfmQuality !== art.sfmQuality ||
    job.projectId !== art.projectId
  ) {
    return { outcome: "DENY", mutatesPointer: false, code: "CONFLICT" };
  }

  const version = params.version;
  if (version == null || version.id !== art.sfmVersionId) {
    return { outcome: "DENY", mutatesPointer: false, code: "NOT_FOUND" };
  }
  if (version.ownerId !== art.ownerId) {
    return { outcome: "DENY", mutatesPointer: false, code: "NOT_OWNER" };
  }
  if (version.projectId !== art.projectId) {
    return { outcome: "DENY", mutatesPointer: false, code: "CONFLICT" };
  }
  if (version.status !== "EXPORTS_ELIGIBLE") {
    return { outcome: "DENY", mutatesPointer: false, code: "NOT_ELIGIBLE" };
  }
  if (
    version.expiresAt != null &&
    new Date(version.expiresAt).getTime() <= params.nowMs
  ) {
    return { outcome: "DENY", mutatesPointer: false, code: "NOT_ELIGIBLE" };
  }

  const grant = params.grant;
  if (grant == null) {
    return { outcome: "DENY", mutatesPointer: false, code: "NO_GRANT" };
  }
  if (
    grant.userId !== version.ownerId ||
    grant.versionId !== art.sfmVersionId
  ) {
    return { outcome: "DENY", mutatesPointer: false, code: "NO_GRANT" };
  }
  if (!grant.grantedQualities.includes(art.sfmQuality)) {
    return { outcome: "DENY", mutatesPointer: false, code: "QUALITY_DENIED" };
  }

  // FIRST_COMMIT_WINS — never demote an existing different current.
  if (
    params.existingCurrentArtifactId != null &&
    params.existingCurrentArtifactId !== art.id
  ) {
    return { outcome: "DENY", mutatesPointer: false, code: "CONFLICT" };
  }

  return { outcome: "ALLOW_PROMOTE", mutatesPointer: true };
}

/**
 * Concurrent promote same (version, quality): first winner stays current;
 * second CONFLICT; loser history READY non-current; no silent overwrite.
 */
export function decideConcurrentPromoteOutcome(params: {
  firstWinnerArtifactId: string;
  secondLoserArtifactId: string;
}): {
  policy: "FIRST_COMMIT_WINS";
  winnerIsCurrent: true;
  loserIsCurrent: false;
  winnerDemoted: false;
  historyPreserved: true;
  silentOverwrite: false;
} {
  if (params.firstWinnerArtifactId === params.secondLoserArtifactId) {
    throw new Error("winner and loser must differ");
  }
  return {
    policy: "FIRST_COMMIT_WINS",
    winnerIsCurrent: true,
    loserIsCurrent: false,
    winnerDemoted: false,
    historyPreserved: true,
    silentOverwrite: false,
  };
}

/**
 * F-02 — reachable partial-finalize states and safe retry (no auto QUEUED).
 * Live multi-step atomicity remains UNVERIFIED without Postgres.
 */
export type SfmFinalizePartialPhase =
  | "UPLOAD_ONLY"
  | "ARTIFACT_READY_JOB_RUNNING"
  | "ARTIFACT_READY_JOB_SUCCEEDED_NOT_CURRENT"
  | "COMPLETE_CURRENT"
  | "LOSER_READY_NOT_CURRENT";

export function decideSfmFinalizeRetry(params: {
  phase: SfmFinalizePartialPhase;
  sameJobId: boolean;
  sameObjectKey: boolean;
  otherCurrentExists: boolean;
}): {
  canRetryFinalize: boolean;
  mayUpsertSameObjectKey: boolean;
  autoRequeue: false;
  promotesIfOtherCurrent: false | "CONFLICT";
  notes: string;
} {
  if (!params.sameJobId) {
    return {
      canRetryFinalize: false,
      mayUpsertSameObjectKey: false,
      autoRequeue: false,
      promotesIfOtherCurrent: false,
      notes: "Retry is scoped to the same render_job_id only.",
    };
  }
  switch (params.phase) {
    case "UPLOAD_ONLY":
      return {
        canRetryFinalize: true,
        mayUpsertSameObjectKey: params.sameObjectKey,
        autoRequeue: false,
        promotesIfOtherCurrent: params.otherCurrentExists
          ? "CONFLICT"
          : false,
        notes:
          "Re-run finalize: upsert same jobId key, insert READY is_current=false, SUCCEEDED, promote (FIRST_COMMIT_WINS).",
      };
    case "ARTIFACT_READY_JOB_RUNNING":
      return {
        canRetryFinalize: true,
        mayUpsertSameObjectKey: params.sameObjectKey,
        autoRequeue: false,
        promotesIfOtherCurrent: params.otherCurrentExists
          ? "CONFLICT"
          : false,
        notes:
          "Reuse existing READY by render_job_id; CAS job RUNNING→SUCCEEDED; promote.",
      };
    case "ARTIFACT_READY_JOB_SUCCEEDED_NOT_CURRENT":
      return {
        canRetryFinalize: true,
        mayUpsertSameObjectKey: false,
        autoRequeue: false,
        promotesIfOtherCurrent: params.otherCurrentExists
          ? "CONFLICT"
          : false,
        notes:
          "Promote-only recovery; if another current exists → CONFLICT, loser stays history.",
      };
    case "COMPLETE_CURRENT":
      return {
        canRetryFinalize: true,
        mayUpsertSameObjectKey: false,
        autoRequeue: false,
        promotesIfOtherCurrent: false,
        notes: "Idempotent promote of the same current artifact.",
      };
    case "LOSER_READY_NOT_CURRENT":
      return {
        canRetryFinalize: true,
        mayUpsertSameObjectKey: false,
        autoRequeue: false,
        promotesIfOtherCurrent: "CONFLICT",
        notes:
          "Loser remains READY non-current; retry promote never demotes winner (FIRST_COMMIT_WINS).",
      };
  }
}
