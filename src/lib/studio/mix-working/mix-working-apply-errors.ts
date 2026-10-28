/**
 * A1 Mix Working apply — API/service error types.
 */

export type MixWorkingApplyErrorCode =
  | "FORBIDDEN_OP"
  | "INVALID_DOCUMENT"
  | "SNAPSHOT_TOO_LARGE"
  | "IDEMPOTENCY_KEY_REUSE"
  | "INVALID_REQUEST"
  | "REVISION_NOT_FOUND"
  | "REVISION_INVALID"
  | "REVISION_COMPARE_INVALID";

export class MixWorkingApplyError extends Error {
  readonly code: MixWorkingApplyErrorCode;

  constructor(code: MixWorkingApplyErrorCode, message: string) {
    super(message);
    this.name = "MixWorkingApplyError";
    this.code = code;
  }
}

export function httpStatusForMixWorkingApplyError(
  code: MixWorkingApplyErrorCode,
): number {
  switch (code) {
    case "IDEMPOTENCY_KEY_REUSE":
      return 409;
    case "REVISION_NOT_FOUND":
      return 404;
    case "FORBIDDEN_OP":
    case "INVALID_DOCUMENT":
    case "SNAPSHOT_TOO_LARGE":
    case "INVALID_REQUEST":
    case "REVISION_INVALID":
    case "REVISION_COMPARE_INVALID":
      return 400;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
