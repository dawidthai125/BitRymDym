/**
 * Recording Wave 4/5 — take AuthZ (record access + owner boundary helpers).
 * Entitlement / retention / anti-abuse caps live in entitlement.ts (SSOT).
 * Wave 5: GRANT_RECORD is an access source; V1 PUBLISHED path remains W4-compatible.
 */

import type { AuthContext } from "@/lib/auth/types";
import type { BeatRecordAccessSource } from "@/config/beat-access-grants";
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
 * RECORD contract (W4 + W5):
 * - authenticated
 * - beat.status === PUBLISHED (non-PUBLISHED DENY even with grant)
 * - entitlement (account level) — grant never raises limits
 * - beat access: PUBLIC_PUBLISHED (V1 default for PUBLISHED) OR GRANT_RECORD
 *
 * V1: every PUBLISHED beat is PUBLIC_PUBLISHED for entitled users (W4 parity).
 * activeRecordGrant labels GRANT_RECORD when an ACTIVE grant exists; it is not
 * required for ALLOW on PUBLISHED and never unlocks non-PUBLISHED.
 */
export function assertTakeRecordAccess(params: {
  context: AuthContext;
  beat: {
    id: string;
    status: string;
    durationSeconds: number;
  };
  /** Pre-resolved ACTIVE grant.can_record for this actor+beat (Wave 5). */
  activeRecordGrant?: boolean;
}): {
  maxRecordingSeconds: number;
  accessSource: BeatRecordAccessSource;
} {
  if (!params.context.userId) {
    throw new TakeAuthzError("Authentication required.", "UNAUTHENTICATED");
  }
  if (params.beat.status !== "PUBLISHED") {
    throw new TakeAuthzError(
      "Recording is only allowed on PUBLISHED beats.",
      "FORBIDDEN",
    );
  }

  const publicPublished = true;
  const grantRecord = params.activeRecordGrant === true;
  if (!publicPublished && !grantRecord) {
    throw new TakeAuthzError("Recording is not allowed for this beat.", "FORBIDDEN");
  }

  try {
    const maxRecordingSeconds = computeRecordingMaxSeconds({
      accountLevel: params.context.profile.accountLevel,
      beatDurationSeconds: params.beat.durationSeconds,
    });
    return {
      maxRecordingSeconds,
      accessSource: grantRecord ? "GRANT_RECORD" : "PUBLIC_PUBLISHED",
    };
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
