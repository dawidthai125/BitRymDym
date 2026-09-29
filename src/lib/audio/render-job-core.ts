/**
 * E3.5 — pure Render Job domain helpers (no server-only; unit-test safe).
 * AuthZ / DB mutations live in render-job-service.ts.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";
import {
  AUDIO_ARTIFACT_QUOTA_FREE_BYTES,
  AUDIO_ARTIFACT_QUOTA_PREMIUM_BYTES,
  AUDIO_ARTIFACT_RETENTION_FREE_SECONDS,
  AUDIO_ARTIFACT_RETENTION_PREMIUM_SECONDS,
  AUDIO_RENDER_CONCURRENT_FREE,
  AUDIO_RENDER_CONCURRENT_PREMIUM,
  AUDIO_RENDER_FREE_RENDERS_PER_UTC_DAY,
  AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
  AUDIO_RENDER_MAX_ATTEMPTS,
  AUDIO_RENDER_PREMIUM_RENDERS_PER_UTC_DAY,
} from "@/config/audio-render";
import type { EffectiveAudioEntitlement } from "@/lib/audio/effective-entitlement";
import type { MixParameters } from "@/lib/mix/params";
import type { RenderJobStatus, RenderJobTier } from "@/types/domain";
import { RENDER_JOB_TIERS } from "@/types/domain";
import { utcDayWindowStart } from "@/lib/downloads/limits";

export const RENDER_JOB_ACTIVE_STATUSES = [
  "QUEUED",
  "RUNNING",
] as const satisfies readonly RenderJobStatus[];

export const RENDER_JOB_TERMINAL_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
] as const satisfies readonly RenderJobStatus[];

export type RenderJobEntitlementSnapshot = {
  entitlement: {
    userId: string | null;
    accountLevel: EffectiveAudioEntitlement["accountLevel"];
    premiumActive: boolean;
    premiumSource: string | null;
    premiumExpiresAt: string | null;
    capabilities: readonly AudioCapabilityKey[];
  };
  parameters: MixParameters;
  paramsVersion: number;
};

export class RenderJobDomainError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "UNAUTHENTICATED"
    | "NOT_FOUND"
    | "DISABLED"
    | "CONFLICT"
    | "INVALID"
    | "LIMIT";
  constructor(
    message: string,
    code: RenderJobDomainError["code"] = "FORBIDDEN",
  ) {
    super(message);
    this.name = "RenderJobDomainError";
    this.code = code;
  }
}

export function isRenderJobTier(value: unknown): value is RenderJobTier {
  return (
    typeof value === "string" &&
    (RENDER_JOB_TIERS as readonly string[]).includes(value)
  );
}

export function capabilityForRenderTier(
  tier: RenderJobTier,
): AudioCapabilityKey {
  if (tier === "BASIC_MP3") return "EXPORT_BASIC_MP3";
  if (tier === "HQ_MP3") return "EXPORT_HQ_MP3";
  return "EXPORT_WAV";
}

export function isActiveRenderJobStatus(status: RenderJobStatus): boolean {
  return (RENDER_JOB_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function isTerminalRenderJobStatus(status: RenderJobStatus): boolean {
  return (RENDER_JOB_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function buildRenderJobEntitlementSnapshot(params: {
  entitlement: EffectiveAudioEntitlement;
  parameters: MixParameters;
  paramsVersion: number;
}): RenderJobEntitlementSnapshot {
  return {
    entitlement: {
      userId: params.entitlement.userId,
      accountLevel: params.entitlement.accountLevel,
      premiumActive: params.entitlement.premiumActive,
      premiumSource: params.entitlement.premiumSource,
      premiumExpiresAt: params.entitlement.premiumExpiresAt,
      capabilities: [...params.entitlement.capabilities],
    },
    parameters: params.parameters,
    paramsVersion: params.paramsVersion,
  };
}

export function parseRenderJobEntitlementSnapshot(
  raw: unknown,
): RenderJobEntitlementSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RenderJobDomainError(
      "Invalid entitlement_snapshot.",
      "INVALID",
    );
  }
  const o = raw as Record<string, unknown>;
  if (!o.entitlement || !o.parameters || typeof o.paramsVersion !== "number") {
    throw new RenderJobDomainError(
      "entitlement_snapshot missing required fields.",
      "INVALID",
    );
  }
  return raw as RenderJobEntitlementSnapshot;
}

/** CLAIM starts the 180s wall clock (IP-03). Queue wait excluded. */
export function computeTimeoutAtFromClaim(
  claimAt: Date,
  timeoutSeconds: number = AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
): Date {
  return new Date(claimAt.getTime() + timeoutSeconds * 1000);
}

export function isRunningJobTimedOut(params: {
  status: RenderJobStatus;
  timeoutAt: string | null;
  nowMs?: number;
}): boolean {
  if (params.status !== "RUNNING") return false;
  if (!params.timeoutAt) return false;
  const now = params.nowMs ?? Date.now();
  return new Date(params.timeoutAt).getTime() <= now;
}

export function dailyRenderLimit(premiumActive: boolean): number {
  return premiumActive
    ? AUDIO_RENDER_PREMIUM_RENDERS_PER_UTC_DAY
    : AUDIO_RENDER_FREE_RENDERS_PER_UTC_DAY;
}

export function concurrentRenderLimit(premiumActive: boolean): number {
  return premiumActive
    ? AUDIO_RENDER_CONCURRENT_PREMIUM
    : AUDIO_RENDER_CONCURRENT_FREE;
}

export function assertUnderDailyCap(params: {
  jobsCreatedToday: number;
  premiumActive: boolean;
}): void {
  const limit = dailyRenderLimit(params.premiumActive);
  if (params.jobsCreatedToday >= limit) {
    throw new RenderJobDomainError(
      `Daily render limit reached (${limit}).`,
      "LIMIT",
    );
  }
}

export function assertUnderConcurrentCap(params: {
  activeJobs: number;
  premiumActive: boolean;
}): void {
  const limit = concurrentRenderLimit(params.premiumActive);
  if (params.activeJobs >= limit) {
    throw new RenderJobDomainError(
      `Concurrent render limit reached (${limit}).`,
      "LIMIT",
    );
  }
}

export function assertUnderQuota(params: {
  usedBytes: number;
  quotaBytes: number;
}): void {
  if (params.usedBytes >= params.quotaBytes) {
    throw new RenderJobDomainError(
      "Active artifact storage quota exceeded.",
      "LIMIT",
    );
  }
}

export function assertAttemptWithinMax(
  attempt: number,
  max: number = AUDIO_RENDER_MAX_ATTEMPTS,
): void {
  if (attempt < 1 || attempt > max) {
    throw new RenderJobDomainError(
      `Attempt out of range 1..${max}.`,
      "INVALID",
    );
  }
}

/** Can user cancel this status? */
export function canCancelRenderJob(status: RenderJobStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

/** Can worker CLAIM this status? */
export function canClaimRenderJob(status: RenderJobStatus): boolean {
  return status === "QUEUED";
}

/**
 * Can worker complete SUCCESS?
 * CANCELLED / TIMEOUT / FAILED / SUCCEEDED → reject (no resurrect).
 */
export function canCompleteRenderJobSuccess(status: RenderJobStatus): boolean {
  return status === "RUNNING";
}

export function utcDayStartIso(now: Date = new Date()): string {
  return utcDayWindowStart(now).toISOString();
}

export function retentionSecondsForPremium(premiumActive: boolean): number {
  return premiumActive
    ? AUDIO_ARTIFACT_RETENTION_PREMIUM_SECONDS
    : AUDIO_ARTIFACT_RETENTION_FREE_SECONDS;
}

export function quotaBytesForPremium(premiumActive: boolean): number {
  return premiumActive
    ? AUDIO_ARTIFACT_QUOTA_PREMIUM_BYTES
    : AUDIO_ARTIFACT_QUOTA_FREE_BYTES;
}
