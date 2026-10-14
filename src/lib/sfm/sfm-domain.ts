/**
 * SFM Foundation Stage A — pure domain contracts (no I/O).
 * Stages are domain records; ≠ render_jobs.kind (OD-SFM-ID-07 OPEN).
 */

export const SFM_STAGE_KINDS = ["SFM_MIX", "SFM_MASTER"] as const;
export type SfmStageKind = (typeof SFM_STAGE_KINDS)[number];

export const SFM_STAGE_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
] as const;
export type SfmStageStatus = (typeof SFM_STAGE_STATUSES)[number];

export const SFM_VERSION_STATUSES = [
  "ACCEPTED",
  "EXPORTS_ELIGIBLE",
  "SUPERSEDED",
  "EXPIRED",
] as const;
export type SfmVersionStatus = (typeof SFM_VERSION_STATUSES)[number];

export type SfmDomainErrorCode =
  | "FORBIDDEN"
  | "NOT_OWNER"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "ILLEGAL_TRANSITION"
  | "NOT_ELIGIBLE"
  | "INVALID"
  | "INVALID_SESSION"
  | "DISABLED"
  | "CONFLICT"
  | "LIMIT_EXCEEDED"
  | "NO_GRANT"
  | "QUALITY_DENIED"
  | "PLAN_DENIED"
  | "FREE_NO_DOWNLOAD"
  | "NO_SLOT";

export class SfmDomainError extends Error {
  readonly code: SfmDomainErrorCode;

  constructor(message: string, code: SfmDomainErrorCode) {
    super(message);
    this.name = "SfmDomainError";
    this.code = code;
  }
}

export function isSfmStageKind(value: unknown): value is SfmStageKind {
  return (
    typeof value === "string" &&
    (SFM_STAGE_KINDS as readonly string[]).includes(value)
  );
}

export function isSfmStageStatus(value: unknown): value is SfmStageStatus {
  return (
    typeof value === "string" &&
    (SFM_STAGE_STATUSES as readonly string[]).includes(value)
  );
}

export function isSfmVersionStatus(value: unknown): value is SfmVersionStatus {
  return (
    typeof value === "string" &&
    (SFM_VERSION_STATUSES as readonly string[]).includes(value)
  );
}

/** Pure guard: MASTER may start only after MIX domain SUCCEEDED. */
export function assertCanStartSfmStage(params: {
  kind: SfmStageKind;
  mixStatus: SfmStageStatus | null;
  currentStatus: SfmStageStatus;
}): void {
  if (params.kind === "SFM_MASTER" && params.mixStatus !== "SUCCEEDED") {
    throw new SfmDomainError(
      "SFM_MASTER cannot start before SFM_MIX SUCCEEDED.",
      "ILLEGAL_TRANSITION",
    );
  }
  if (
    params.currentStatus !== "PENDING" &&
    params.currentStatus !== "RUNNING"
  ) {
    throw new SfmDomainError(
      `Cannot start stage from status ${params.currentStatus}.`,
      "ILLEGAL_TRANSITION",
    );
  }
}

/** Pure guard: complete SUCCEEDED/FAILED only from RUNNING (idempotent terminal OK). */
export function assertCanCompleteSfmStage(params: {
  kind: SfmStageKind;
  mixStatus: SfmStageStatus | null;
  currentStatus: SfmStageStatus;
  nextStatus: "SUCCEEDED" | "FAILED";
}): void {
  if (
    params.currentStatus === params.nextStatus &&
    (params.currentStatus === "SUCCEEDED" || params.currentStatus === "FAILED")
  ) {
    return;
  }
  if (params.currentStatus !== "RUNNING") {
    throw new SfmDomainError(
      `Cannot complete stage from status ${params.currentStatus}.`,
      "ILLEGAL_TRANSITION",
    );
  }
  if (
    params.kind === "SFM_MASTER" &&
    params.nextStatus === "SUCCEEDED" &&
    params.mixStatus !== "SUCCEEDED"
  ) {
    throw new SfmDomainError(
      "SFM_MASTER cannot SUCCEEDED before SFM_MIX SUCCEEDED.",
      "ILLEGAL_TRANSITION",
    );
  }
}

/** Map Postgres RAISE EXCEPTION message tokens to domain codes. */
export function mapSfmRpcErrorMessage(message: string): SfmDomainErrorCode {
  const token = message.trim().split(/\s|:/)[0]?.toUpperCase() ?? "";
  switch (token) {
    case "NOT_OWNER":
      return "NOT_OWNER";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "VERSION_CONFLICT":
      return "VERSION_CONFLICT";
    case "ILLEGAL_TRANSITION":
      return "ILLEGAL_TRANSITION";
    case "NOT_ELIGIBLE":
      return "NOT_ELIGIBLE";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "INVALID":
      return "INVALID";
    case "LIMIT_EXCEEDED":
      return "LIMIT_EXCEEDED";
    case "NO_GRANT":
      return "NO_GRANT";
    case "NO_SLOT":
      return "NO_SLOT";
    case "FREE_NO_DOWNLOAD":
      return "FREE_NO_DOWNLOAD";
    default:
      if (message.includes("VERSION_CONFLICT")) return "VERSION_CONFLICT";
      if (message.includes("ILLEGAL_TRANSITION")) return "ILLEGAL_TRANSITION";
      if (message.includes("LIMIT_EXCEEDED")) return "LIMIT_EXCEEDED";
      if (message.includes("NOT_OWNER")) return "NOT_OWNER";
      if (message.includes("NOT_FOUND")) return "NOT_FOUND";
      if (message.includes("NOT_ELIGIBLE")) return "NOT_ELIGIBLE";
      return "CONFLICT";
  }
}
