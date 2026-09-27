/**
 * Recording Wave 4 — take AuthZ (record access + owner boundary helpers).
 * Entitlement / retention / anti-abuse caps live in entitlement.ts (SSOT).
 */

import type { AuthContext } from "@/lib/auth/types";
import { computeRecordingMaxSeconds } from "@/lib/takes/entitlement";

export class TakeAuthzError extends Error {
  readonly code: "FORBIDDEN" | "NOT_FOUND" | "UNAUTHENTICATED" = "FORBIDDEN";
  constructor(
    message: string,
    code: "FORBIDDEN" | "NOT_FOUND" | "UNAUTHENTICATED" = "FORBIDDEN",
  ) {
    super(message);
    this.name = "TakeAuthzError";
    this.code = code;
  }
}

/** @deprecated Use computeRecordingMaxSeconds from entitlement.ts */
export function computeInterimRecordingMaxSeconds(
  beatDurationSeconds: number,
): number {
  return computeRecordingMaxSeconds({
    accountLevel: "PRO_RAPPER",
    beatDurationSeconds,
  });
}

export {
  recordingModeForMaxSeconds,
  retentionSecondsForAccountLevel,
} from "@/lib/takes/entitlement";

/**
 * Wave 4 RECORD contract: authenticated profile may record on PUBLISHED beats.
 * Max seconds from account level + beat duration (server SSOT).
 * Anonymous DENY. Shared grants OUT.
 */
export function assertTakeRecordAccess(params: {
  context: AuthContext;
  beat: {
    id: string;
    status: string;
    durationSeconds: number;
  };
}): { maxRecordingSeconds: number } {
  if (!params.context.userId) {
    throw new TakeAuthzError("Authentication required.", "UNAUTHENTICATED");
  }
  if (params.beat.status !== "PUBLISHED") {
    throw new TakeAuthzError(
      "Recording is only allowed on PUBLISHED beats.",
      "FORBIDDEN",
    );
  }
  try {
    const maxRecordingSeconds = computeRecordingMaxSeconds({
      accountLevel: params.context.profile.accountLevel,
      beatDurationSeconds: params.beat.durationSeconds,
    });
    return { maxRecordingSeconds };
  } catch {
    throw new TakeAuthzError("Invalid beat duration.", "FORBIDDEN");
  }
}

/** Client must never choose storage identity fields. */
export function rejectClientChosenTakeStorageParams(params: {
  objectKey?: string | null;
  ownerId?: string | null;
  bucket?: string | null;
  takeId?: string | null;
}): void {
  if (
    params.objectKey != null ||
    params.ownerId != null ||
    params.bucket != null ||
    params.takeId != null
  ) {
    throw new TakeAuthzError(
      "Client must not supply objectKey, ownerId, bucket, or takeId.",
      "FORBIDDEN",
    );
  }
}
