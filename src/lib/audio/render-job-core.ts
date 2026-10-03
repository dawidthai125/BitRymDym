/**
 * E3.5 — pure Render Job domain helpers (no server-only; unit-test safe).
 * AuthZ / DB mutations live in render-job-service.ts.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";
import {
  AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
  AUDIO_RENDER_MAX_ATTEMPTS,
} from "@/config/audio-render";
import { limitsForPremiumTier } from "@/config/premium-tiers";
import type { EffectiveAudioEntitlement } from "@/lib/audio/effective-entitlement";
import type { MixParameters } from "@/lib/mix/params";
import type { PremiumTier } from "@/types/premium";
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
    premiumTier: PremiumTier;
    premiumSource: string | null;
    premiumExpiresAt: string | null;
    capabilities: readonly AudioCapabilityKey[];
    limits: {
      rendersDaily: number;
      rendersConcurrent: number;
      artifactRetentionSeconds: number;
      artifactQuotaBytes: number;
      /** Design-catalog Gold 90d — not production-enabled in W2-A. */
      artifactRetentionDesignSeconds: number;
      goldRetentionDesignOnly: boolean;
    };
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
  const tier = params.entitlement.premiumTier ?? "FREE";
  const limits = limitsForPremiumTier(tier);
  return {
    entitlement: {
      userId: params.entitlement.userId,
      accountLevel: params.entitlement.accountLevel,
      premiumActive: params.entitlement.premiumActive,
      premiumTier: tier,
      premiumSource: params.entitlement.premiumSource,
      premiumExpiresAt: params.entitlement.premiumExpiresAt,
      capabilities: [...params.entitlement.capabilities],
      limits: {
        rendersDaily: limits.rendersDaily,
        rendersConcurrent: limits.rendersConcurrent,
        artifactRetentionSeconds: limits.artifactRetentionSeconds,
        artifactQuotaBytes: limits.artifactQuotaBytes,
        artifactRetentionDesignSeconds: limits.artifactRetentionDesignSeconds,
        goldRetentionDesignOnly: limits.goldRetentionDesignOnly,
      },
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
  const snap = raw as RenderJobEntitlementSnapshot;
  const ent = snap.entitlement as RenderJobEntitlementSnapshot["entitlement"] & {
    premiumTier?: PremiumTier;
    limits?: RenderJobEntitlementSnapshot["entitlement"]["limits"];
  };
  // E3 binary snapshots: derive tier/limits for worker completion compatibility.
  if (!ent.premiumTier || !ent.limits) {
    const tier: PremiumTier =
      ent.premiumTier ?? (ent.premiumActive ? "SILVER" : "FREE");
    const limits = limitsForPremiumTier(tier);
    return {
      ...snap,
      entitlement: {
        ...ent,
        premiumTier: tier,
        limits: ent.limits ?? {
          rendersDaily: limits.rendersDaily,
          rendersConcurrent: limits.rendersConcurrent,
          artifactRetentionSeconds: limits.artifactRetentionSeconds,
          artifactQuotaBytes: limits.artifactQuotaBytes,
          artifactRetentionDesignSeconds: limits.artifactRetentionDesignSeconds,
          goldRetentionDesignOnly: limits.goldRetentionDesignOnly,
        },
      },
    };
  }
  return snap;
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

export function dailyRenderLimitForTier(tier: PremiumTier): number {
  return limitsForPremiumTier(tier).rendersDaily;
}

export function concurrentRenderLimitForTier(tier: PremiumTier): number {
  return limitsForPremiumTier(tier).rendersConcurrent;
}

/** Compatibility: premiumActive → SILVER limits (legacy binary class), else FREE. */
export function dailyRenderLimit(premiumActive: boolean): number {
  return dailyRenderLimitForTier(premiumActive ? "SILVER" : "FREE");
}

export function concurrentRenderLimit(premiumActive: boolean): number {
  return concurrentRenderLimitForTier(premiumActive ? "SILVER" : "FREE");
}

export function assertUnderDailyCap(params: {
  jobsCreatedToday: number;
  premiumActive?: boolean;
  premiumTier?: PremiumTier;
}): void {
  const tier =
    params.premiumTier ?? (params.premiumActive ? "SILVER" : "FREE");
  const limit = dailyRenderLimitForTier(tier);
  if (params.jobsCreatedToday >= limit) {
    throw new RenderJobDomainError(
      `Daily render limit reached (${limit}).`,
      "LIMIT",
    );
  }
}

export function assertUnderConcurrentCap(params: {
  activeJobs: number;
  premiumActive?: boolean;
  premiumTier?: PremiumTier;
}): void {
  const tier =
    params.premiumTier ?? (params.premiumActive ? "SILVER" : "FREE");
  const limit = concurrentRenderLimitForTier(tier);
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

export function retentionSecondsForTier(tier: PremiumTier): number {
  return limitsForPremiumTier(tier).artifactRetentionSeconds;
}

export function quotaBytesForTier(tier: PremiumTier): number {
  return limitsForPremiumTier(tier).artifactQuotaBytes;
}

/** Compatibility: premiumActive → SILVER retention/quota class. */
export function retentionSecondsForPremium(premiumActive: boolean): number {
  return retentionSecondsForTier(premiumActive ? "SILVER" : "FREE");
}

export function quotaBytesForPremium(premiumActive: boolean): number {
  return quotaBytesForTier(premiumActive ? "SILVER" : "FREE");
}
