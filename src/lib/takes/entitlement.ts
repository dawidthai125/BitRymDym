/**
 * P1 — canonical Sample Policy resolver (Premium Tier / ANONYMOUS).
 * Single SSOT for duration, TTL, daily sessions, active READY cap, canDownloadOwnTake.
 * Client never supplies tier or limits.
 */

import {
  RECORDING_GLOBAL_MAX_SECONDS,
  SAMPLE_POLICY_DEFAULTS,
  type SamplePolicyActor,
  type SamplePolicyAdminDurationTier,
} from "@/config/recording";
import type { PremiumTier } from "@/types/premium";
import { isPremiumTier } from "@/types/premium";

export type SamplePolicy = {
  actor: SamplePolicyActor;
  maxRecordingSeconds: number;
  ttlSeconds: number;
  dailySessionLimit: number;
  activeReadyCap: number;
  /** Capability only — take-download enforcement is P4. */
  canDownloadOwnTake: boolean;
};

export type SamplePolicyDurationOverrides = {
  bronzeMaxRecordingSeconds?: number;
  silverMaxRecordingSeconds?: number;
  goldMaxRecordingSeconds?: number;
};

export type RecordingAbuseCaps = {
  maxActiveReady: number;
  maxSessionsPerUtcDay: number;
};

/** @deprecated Use SAMPLE_POLICY_DEFAULTS.FREE.maxRecordingSeconds */
export const BEGINNER_RECORDING_MAX_SECONDS =
  SAMPLE_POLICY_DEFAULTS.FREE.maxRecordingSeconds;

export function isSamplePolicyActor(
  value: unknown,
): value is SamplePolicyActor {
  return (
    value === "ANONYMOUS" ||
    value === "FREE" ||
    value === "BRONZE" ||
    value === "SILVER" ||
    value === "GOLD"
  );
}

/**
 * Validate Admin override duration. Returns null if ok, else error message.
 */
export function validateAdminRecordingDurationSeconds(
  value: unknown,
): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "Duration must be an integer number of seconds.";
  }
  if (value < 1) {
    return "Duration must be at least 1 second.";
  }
  if (value > RECORDING_GLOBAL_MAX_SECONDS) {
    return `Duration must be at most ${RECORDING_GLOBAL_MAX_SECONDS} seconds.`;
  }
  return null;
}

function resolveTierDurationCap(
  actor: SamplePolicyActor,
  overrides?: SamplePolicyDurationOverrides | null,
): number {
  const defaults = SAMPLE_POLICY_DEFAULTS[actor];
  if (actor === "ANONYMOUS" || actor === "FREE") {
    return defaults.maxRecordingSeconds;
  }
  if (actor === "BRONZE") {
    const o = overrides?.bronzeMaxRecordingSeconds;
    if (o != null && validateAdminRecordingDurationSeconds(o) === null) {
      return o;
    }
    return defaults.maxRecordingSeconds;
  }
  if (actor === "SILVER") {
    const o = overrides?.silverMaxRecordingSeconds;
    if (o != null && validateAdminRecordingDurationSeconds(o) === null) {
      return o;
    }
    return defaults.maxRecordingSeconds;
  }
  // GOLD
  const o = overrides?.goldMaxRecordingSeconds;
  if (o != null && validateAdminRecordingDurationSeconds(o) === null) {
    return o;
  }
  return defaults.maxRecordingSeconds;
}

/**
 * Central Sample Policy resolver — ONLY source for recording sample limits.
 * forged / unknown actor → fail closed to FREE for auth-shaped strings, else throw.
 */
export function getSamplePolicy(params: {
  actor: SamplePolicyActor;
  beatDurationSeconds: number;
  overrides?: SamplePolicyDurationOverrides | null;
}): SamplePolicy {
  if (!isSamplePolicyActor(params.actor)) {
    throw new Error("Invalid sample policy actor.");
  }
  const beat = Math.floor(params.beatDurationSeconds);
  if (!Number.isFinite(beat) || beat <= 0) {
    throw new Error("Invalid beat duration.");
  }

  const defaults = SAMPLE_POLICY_DEFAULTS[params.actor];
  const tierCap = resolveTierDurationCap(params.actor, params.overrides);
  const capped = Math.min(
    beat,
    tierCap,
    RECORDING_GLOBAL_MAX_SECONDS,
  );

  return {
    actor: params.actor,
    maxRecordingSeconds: capped,
    ttlSeconds: defaults.ttlSeconds,
    dailySessionLimit: defaults.maxSessionsPerUtcDay,
    activeReadyCap: defaults.maxActiveReady,
    canDownloadOwnTake: defaults.canDownloadOwnTake,
  };
}

/** Map Product Entitlement premium tier → sample policy actor (auth only). */
export function sampleActorFromPremiumTier(
  premiumTier: PremiumTier | string | null | undefined,
): Exclude<SamplePolicyActor, "ANONYMOUS"> {
  if (isPremiumTier(premiumTier)) {
    return premiumTier;
  }
  // Fail closed: unknown / forged → FREE
  return "FREE";
}

/**
 * Whether a requested duration is allowed under policy.
 * Used for security tests / explicit checks (session uses policy max as SSOT).
 */
export function assertRequestedDurationAllowed(params: {
  requestedSeconds: number;
  policy: SamplePolicy;
}): { ok: true } | { ok: false; error: string } {
  const requested = Math.floor(params.requestedSeconds);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, error: "Invalid requested duration." };
  }
  if (requested > params.policy.maxRecordingSeconds) {
    return {
      ok: false,
      error: `Requested duration ${requested}s exceeds policy max ${params.policy.maxRecordingSeconds}s.`,
    };
  }
  if (requested > RECORDING_GLOBAL_MAX_SECONDS) {
    return {
      ok: false,
      error: `Requested duration exceeds global max ${RECORDING_GLOBAL_MAX_SECONDS}s.`,
    };
  }
  return { ok: true };
}

export function antiAbuseCapsFromPolicy(
  policy: SamplePolicy,
): RecordingAbuseCaps {
  return {
    maxActiveReady: policy.activeReadyCap,
    maxSessionsPerUtcDay: policy.dailySessionLimit,
  };
}

/** QUICK = at most FREE default duration; else FULL. */
export function recordingModeForMaxSeconds(
  maxSeconds: number,
): "QUICK" | "FULL" {
  return maxSeconds <= SAMPLE_POLICY_DEFAULTS.FREE.maxRecordingSeconds
    ? "QUICK"
    : "FULL";
}

/** Active READY = READY, not deleted, not past expires_at. */
export function isTakeActivelyReady(params: {
  status: string;
  deletedAt: string | null | undefined;
  expiresAt: string;
  nowMs?: number;
}): boolean {
  if (params.status !== "READY") return false;
  if (params.deletedAt) return false;
  const now = params.nowMs ?? Date.now();
  return new Date(params.expiresAt).getTime() > now;
}

export function isTakeExpired(params: {
  expiresAt: string;
  nowMs?: number;
}): boolean {
  const now = params.nowMs ?? Date.now();
  return new Date(params.expiresAt).getTime() <= now;
}

// ---------------------------------------------------------------------------
// Compatibility shims — prefer getSamplePolicy. Kept to avoid cascading breaks
// in unrelated docs; recording transports must not call Account Level helpers.
// ---------------------------------------------------------------------------

/** @deprecated P1 — use getSamplePolicy({ actor: sampleActorFromPremiumTier(...) }) */
export function computeRecordingMaxSeconds(params: {
  accountLevel: string;
  beatDurationSeconds: number;
}): number {
  // Legacy Account Level mapping was BEGINNER=30, PRO/LEGEND=180.
  // P1: Account Level is NOT sample policy — treat as FREE defaults when misused.
  void params.accountLevel;
  return getSamplePolicy({
    actor: "FREE",
    beatDurationSeconds: params.beatDurationSeconds,
  }).maxRecordingSeconds;
}

/** @deprecated P1 — use getSamplePolicy({ actor: "ANONYMOUS" }) */
export function computeAnonymousRecordingMaxSeconds(
  beatDurationSeconds: number,
): number {
  return getSamplePolicy({
    actor: "ANONYMOUS",
    beatDurationSeconds,
  }).maxRecordingSeconds;
}

/** @deprecated P1 — use getSamplePolicy */
export function antiAbuseCapsForAnonymous(): RecordingAbuseCaps {
  const p = SAMPLE_POLICY_DEFAULTS.ANONYMOUS;
  return {
    maxActiveReady: p.maxActiveReady,
    maxSessionsPerUtcDay: p.maxSessionsPerUtcDay,
  };
}

/** @deprecated P1 — use getSamplePolicy */
export function retentionSecondsForAnonymous(): number {
  return SAMPLE_POLICY_DEFAULTS.ANONYMOUS.ttlSeconds;
}

/** @deprecated P1 — Account Level is not sample policy SSOT */
export function retentionSecondsForAccountLevel(_level: string): number {
  void _level;
  return SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds;
}

/** @deprecated P1 — Account Level is not sample policy SSOT */
export function antiAbuseCapsForAccountLevel(
  _level: string,
): RecordingAbuseCaps {
  void _level;
  const p = SAMPLE_POLICY_DEFAULTS.FREE;
  return {
    maxActiveReady: p.maxActiveReady,
    maxSessionsPerUtcDay: p.maxSessionsPerUtcDay,
  };
}

export type { SamplePolicyAdminDurationTier };
