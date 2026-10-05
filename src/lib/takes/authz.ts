/**
 * Recording take AuthZ (record access + owner boundary helpers).
 * Sample limits SSOT: getSamplePolicy (Premium Tier / ANONYMOUS) — P1.
 */

import type { AuthContext } from "@/lib/auth/types";
import type { BeatRecordAccessSource } from "@/config/beat-access-grants";
import type { PremiumTier } from "@/types/premium";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
  type SamplePolicy,
  type SamplePolicyDurationOverrides,
} from "@/lib/takes/entitlement";

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

/** @deprecated Prefer getSamplePolicy — global max via GOLD defaults. */
export function computeInterimRecordingMaxSeconds(
  beatDurationSeconds: number,
): number {
  return getSamplePolicy({
    actor: "GOLD",
    beatDurationSeconds,
  }).maxRecordingSeconds;
}

export {
  recordingModeForMaxSeconds,
  getSamplePolicy,
} from "@/lib/takes/entitlement";

/**
 * RECORD contract:
 * - authenticated
 * - beat.status === PUBLISHED
 * - Sample Policy from Premium Tier (grant never raises limits)
 * - access: PUBLIC_PUBLISHED OR GRANT_RECORD
 */
export function assertTakeRecordAccess(params: {
  context: AuthContext;
  beat: {
    id: string;
    status: string;
    durationSeconds: number;
  };
  /** Effective Premium Tier from Product Entitlement SSOT (never client). */
  premiumTier: PremiumTier;
  overrides?: SamplePolicyDurationOverrides | null;
  /** Pre-resolved ACTIVE grant.can_record for this actor+beat. */
  activeRecordGrant?: boolean;
}): {
  maxRecordingSeconds: number;
  accessSource: BeatRecordAccessSource;
  policy: SamplePolicy;
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

  const grantRecord = params.activeRecordGrant === true;

  try {
    const actor = sampleActorFromPremiumTier(params.premiumTier);
    const policy = getSamplePolicy({
      actor,
      beatDurationSeconds: params.beat.durationSeconds,
      overrides: params.overrides,
    });
    return {
      maxRecordingSeconds: policy.maxRecordingSeconds,
      accessSource: grantRecord ? "GRANT_RECORD" : "PUBLIC_PUBLISHED",
      policy,
    };
  } catch {
    throw new TakeAuthzError("Invalid beat duration.", "FORBIDDEN");
  }
}

/**
 * Anonymous RECORD AuthZ:
 * - cookie → hash supplied by caller
 * - beat.status === PUBLISHED
 * - Sample Policy ANONYMOUS (15s default)
 * - grants never consulted
 */
export function assertAnonTakeRecordAccess(params: {
  tokenHash: string;
  beat: {
    id: string;
    status: string;
    durationSeconds: number;
  };
}): {
  maxRecordingSeconds: number;
  policy: SamplePolicy;
} {
  if (!params.tokenHash || params.tokenHash.length < 32) {
    throw new TakeAuthzError("Anonymous take identity required.", "UNAUTHENTICATED");
  }
  if (params.beat.status !== "PUBLISHED") {
    throw new TakeAuthzError(
      "Recording is only allowed on PUBLISHED beats.",
      "FORBIDDEN",
    );
  }
  try {
    const policy = getSamplePolicy({
      actor: "ANONYMOUS",
      beatDurationSeconds: params.beat.durationSeconds,
    });
    return {
      maxRecordingSeconds: policy.maxRecordingSeconds,
      policy,
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
