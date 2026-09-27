/**
 * Recording Wave 2 — interim AuthZ for take recording.
 * No new permission keys. Logged-in + PUBLISHED beat only (OD-W2-02/03).
 */

import type { AuthContext } from "@/lib/auth/types";
import {
  RECORDING_GLOBAL_MAX_SECONDS,
  RECORDING_RETENTION_SECONDS,
} from "@/config/recording";
import type { AccountLevel } from "@/types/domain";

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

/** Interim W2: no separate entitlement engine — cap is global 180 only. */
export function computeInterimRecordingMaxSeconds(
  beatDurationSeconds: number,
): number {
  if (
    typeof beatDurationSeconds !== "number" ||
    !Number.isFinite(beatDurationSeconds) ||
    beatDurationSeconds <= 0
  ) {
    throw new TakeAuthzError("Invalid beat duration.", "FORBIDDEN");
  }
  return Math.min(
    Math.floor(beatDurationSeconds),
    RECORDING_GLOBAL_MAX_SECONDS,
  );
}

export function retentionSecondsForAccountLevel(
  level: AccountLevel | string,
): number {
  if (level === "PRO_RAPPER") return RECORDING_RETENTION_SECONDS.PRO_RAPPER;
  if (level === "LEGEND_RAPPER") return RECORDING_RETENTION_SECONDS.LEGEND_RAPPER;
  return RECORDING_RETENTION_SECONDS.BEGINNER_RAPPER;
}

export function recordingModeForMaxSeconds(
  maxSeconds: number,
): "QUICK" | "FULL" {
  return maxSeconds <= 30 ? "QUICK" : "FULL";
}

/**
 * Wave 2 RECORD contract: authenticated profile may record on PUBLISHED beats only.
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
  const maxRecordingSeconds = computeInterimRecordingMaxSeconds(
    params.beat.durationSeconds,
  );
  return { maxRecordingSeconds };
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
