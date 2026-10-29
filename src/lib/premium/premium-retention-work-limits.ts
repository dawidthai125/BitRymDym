/**
 * GO-PREMIUM-72 — Active-path workLimits validation (OD-62-03 A).
 *
 * Active cleanup must receive explicit, finite pageSize / maxKeysPerWork / deadlineMs.
 * Unbounded fallbacks (pageSize→500, maxKeys→∞, no deadline) must not be reachable
 * via the active scheduler path.
 *
 * OD-62-02 concrete production numbers remain NOT APPROVED.
 * Constants below are PROVISIONAL for tests / explicit injection only.
 */

import type { PremiumRetentionHybridLimits } from "@/lib/premium/premium-retention-cleanup-service";

/**
 * PROVISIONAL page size from GO-71 recommendation — NOT Owner-approved production.
 * Tests and explicit injectors may use this; do not treat as OD-62-02 APPROVED.
 */
export const PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_PAGE_SIZE = 50;

/**
 * PROVISIONAL max keys per work from GO-71 — NOT Owner-approved production.
 */
export const PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_MAX_KEYS = 25;

/**
 * PROVISIONAL reserve (ms) before absolute deadline: do not start another work
 * if remaining wall time is below this. Not a platform kill guarantee.
 */
export const PREMIUM_RETENTION_BATCH_DEADLINE_START_RESERVE_MS = 5_000;

/** Optional env keys for future wiring GO — unset means incomplete (fail-closed). */
export const PREMIUM_RETENTION_WORK_PAGE_SIZE_ENV =
  "PREMIUM_RETENTION_WORK_PAGE_SIZE";
export const PREMIUM_RETENTION_WORK_MAX_KEYS_ENV =
  "PREMIUM_RETENTION_WORK_MAX_KEYS";
/** Absolute deadline ms, or omit and use duration env below. */
export const PREMIUM_RETENTION_WORK_DEADLINE_MS_ENV =
  "PREMIUM_RETENTION_WORK_DEADLINE_MS";
/** Relative duration from now (ms). PROVISIONAL — not a production maxDuration. */
export const PREMIUM_RETENTION_WORK_DEADLINE_DURATION_MS_ENV =
  "PREMIUM_RETENTION_WORK_DEADLINE_DURATION_MS";

export type PremiumRetentionActiveWorkLimits = {
  pageSize: number;
  maxKeysPerWork: number;
  /** Absolute wall-clock deadline (Date.now()-compatible). */
  deadlineMs: number;
};

export type PremiumRetentionActiveWorkLimitsValidation =
  | { ok: true; limits: PremiumRetentionActiveWorkLimits }
  | { ok: false; errorClass: string };

function isPositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

/**
 * Validate active-mode workLimits. Rejects omission, non-finite, ≤0, and Infinity.
 */
export function validatePremiumRetentionActiveWorkLimits(
  limits: PremiumRetentionHybridLimits | undefined | null,
): PremiumRetentionActiveWorkLimitsValidation {
  if (limits == null) {
    return { ok: false, errorClass: "WORK_LIMITS_REQUIRED" };
  }

  if (!isPositiveInt(limits.pageSize)) {
    return { ok: false, errorClass: "WORK_LIMITS_PAGE_SIZE_INVALID" };
  }

  if (!isPositiveInt(limits.maxKeysPerWork)) {
    // Infinity / NaN / missing / 0 / negative → invalid (unbounded rejected).
    return { ok: false, errorClass: "WORK_LIMITS_MAX_KEYS_INVALID" };
  }

  if (
    limits.deadlineMs == null ||
    typeof limits.deadlineMs !== "number" ||
    !Number.isFinite(limits.deadlineMs)
  ) {
    return { ok: false, errorClass: "WORK_LIMITS_DEADLINE_INVALID" };
  }

  return {
    ok: true,
    limits: {
      pageSize: limits.pageSize,
      maxKeysPerWork: limits.maxKeysPerWork,
      deadlineMs: limits.deadlineMs,
    },
  };
}

/** True when wall clock has reached/passed the absolute deadline. */
export function isPremiumRetentionDeadlineExceeded(
  deadlineMs: number,
  clockMs: number,
): boolean {
  return Number.isFinite(deadlineMs) && clockMs >= deadlineMs;
}

/**
 * True when there is enough wall time left to start another work unit
 * (deadline minus provisional reserve). Not a platform guarantee.
 */
export function canStartPremiumRetentionWorkWithinDeadline(params: {
  deadlineMs: number;
  clockMs: number;
  reserveMs?: number;
}): boolean {
  const reserve =
    params.reserveMs ?? PREMIUM_RETENTION_BATCH_DEADLINE_START_RESERVE_MS;
  if (!Number.isFinite(params.deadlineMs) || !Number.isFinite(params.clockMs)) {
    return false;
  }
  return params.clockMs + reserve < params.deadlineMs;
}

/**
 * Resolve workLimits from env for cron wiring.
 * Returns null when incomplete — caller must fail-closed (do not invent defaults).
 * Does NOT inject GO-71 provisional 50/25 unless those exact env values are set.
 */
export function resolvePremiumRetentionWorkLimitsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  clockMs: number = Date.now(),
): PremiumRetentionHybridLimits | null {
  const pageRaw = env[PREMIUM_RETENTION_WORK_PAGE_SIZE_ENV];
  const keysRaw = env[PREMIUM_RETENTION_WORK_MAX_KEYS_ENV];
  const deadlineAbsRaw = env[PREMIUM_RETENTION_WORK_DEADLINE_MS_ENV];
  const deadlineDurRaw = env[PREMIUM_RETENTION_WORK_DEADLINE_DURATION_MS_ENV];

  if (pageRaw == null || pageRaw === "" || keysRaw == null || keysRaw === "") {
    return null;
  }

  const pageSize = Number(pageRaw);
  const maxKeysPerWork = Number(keysRaw);
  let deadlineMs: number | null = null;
  if (deadlineAbsRaw != null && deadlineAbsRaw !== "") {
    deadlineMs = Number(deadlineAbsRaw);
  } else if (deadlineDurRaw != null && deadlineDurRaw !== "") {
    const dur = Number(deadlineDurRaw);
    if (Number.isFinite(dur) && dur > 0) {
      deadlineMs = clockMs + dur;
    }
  }

  const candidate: PremiumRetentionHybridLimits = {
    pageSize,
    maxKeysPerWork,
    deadlineMs,
  };
  const validated = validatePremiumRetentionActiveWorkLimits(candidate);
  return validated.ok ? validated.limits : null;
}

/** Test helper: provisional page/keys + synthetic absolute deadline. */
export function buildProvisionalTestWorkLimits(params: {
  nowMs: number;
  /** Wall duration until deadline (default 60s). Synthetic — not OD-62-04. */
  deadlineDurationMs?: number;
  pageSize?: number;
  maxKeysPerWork?: number;
}): PremiumRetentionActiveWorkLimits {
  return {
    pageSize:
      params.pageSize ?? PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_PAGE_SIZE,
    maxKeysPerWork:
      params.maxKeysPerWork ??
      PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_MAX_KEYS,
    deadlineMs: params.nowMs + (params.deadlineDurationMs ?? 60_000),
  };
}
