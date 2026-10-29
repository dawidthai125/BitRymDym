/**
 * GO-PREMIUM-28 / GO-PREMIUM-56 Wave H1 / GO-PREMIUM-67 Wave H2-3 /
 * GO-PREMIUM-72 active workLimits fail-closed —
 * Premium Retention batch orchestrator.
 * Reuses pure planner + per-work executor (H1 keyset + budget hooks + final re-list).
 * No MIX expansion. No leftover sweep. Dry-run never calls the mutating executor.
 *
 * Concurrency (H2-3):
 * - Process mutex: single Node isolate courtesy lock.
 * - Distributed lease (L1): active mode requires explicit `leaseTtlSeconds` (OD-62-06 HOLD —
 *   no production TTL default). Acquire → renew before each work → release in finally.
 * - Does NOT fence Storage DELETE. L2 EXPIRED via leaseFence (H2-4).
 *
 * Active limits (H2 / OD-62-03 A / GO-72):
 * - Explicit finite pageSize, maxKeysPerWork, deadlineMs required before lease/cleanup.
 * - Unbounded fallbacks must not be used on the active path.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import {
  planPremiumWorkExpiry,
  type PremiumCleanupWork,
} from "@/lib/premium/premium-retention-cleanup";
import {
  runPremiumRetentionCleanupForWork,
  type PremiumRetentionCleanupResult,
  type PremiumRetentionHybridLimits,
} from "@/lib/premium/premium-retention-cleanup-service";
import {
  createPremiumRetentionLeaseClient,
  type PremiumRetentionLeaseClient,
  type PremiumRetentionLeaseCallResult,
} from "@/lib/premium/premium-retention-lease";
import {
  canStartPremiumRetentionWorkWithinDeadline,
  isPremiumRetentionDeadlineExceeded,
  validatePremiumRetentionActiveWorkLimits,
  type PremiumRetentionActiveWorkLimits,
} from "@/lib/premium/premium-retention-work-limits";
import { createPremiumRetentionWorkerClient } from "@/lib/supabase/premium-retention-worker-client";

export const PREMIUM_RETENTION_BATCH_DEFAULT_LIMIT = 50;
/** Hard cap — never scan unbounded. */
export const PREMIUM_RETENTION_BATCH_MAX_LIMIT = 100;

export type PremiumRetentionSchedulerMode = "dry-run" | "active";

export type PremiumRetentionLockScope = "process" | "distributed_lease";

export type PremiumRetentionBatchWorkSummary = {
  workId: string;
  outcome: string;
  skippedReason: string | null;
  markedExpired: boolean;
  budgetHit?: boolean;
  deadlineHit?: boolean;
};

export type PremiumRetentionBatchResult = {
  runId: string;
  mode: PremiumRetentionSchedulerMode;
  lockAcquired: boolean;
  lockScope: PremiumRetentionLockScope;
  /** Present when distributed lease was obtained for this run. */
  fencingToken: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  limit: number;
  scanned: number;
  qualified: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  purgeComplete: number;
  purgeIncomplete: number;
  alreadyExpired: number;
  truncated: boolean;
  errorClass: string | null;
  /** Secondary: release failed after a primary outcome (does not replace errorClass). */
  leaseReleaseErrorClass: string | null;
  works: PremiumRetentionBatchWorkSummary[];
};

export type PremiumRetentionSchedulerDeps = {
  listDueWorks: (params: {
    limit: number;
    nowMs: number;
  }) => Promise<PremiumCleanupWork[]>;
  runCleanupForWork: (params: {
    workId: string;
    nowMs: number;
    limits?: PremiumRetentionHybridLimits;
    leaseFence?: { runId: string; fencingToken: number };
  }) => Promise<PremiumRetentionCleanupResult>;
  /** Optional read-only linked-key count for dry-run observability. */
  countLinkedKeys?: (work: PremiumCleanupWork) => Promise<number>;
  /**
   * Injectable lease client (tests). When omitted and active+ttl provided,
   * uses createPremiumRetentionLeaseClient().
   */
  lease?: PremiumRetentionLeaseClient;
};

/** Process-local mutex (single Node isolate only). */
let processLockHeld = false;

export function __resetPremiumRetentionProcessLockForTests(): void {
  processLockHeld = false;
}

export function clampPremiumRetentionBatchLimit(requested?: number): number {
  const raw =
    requested == null || !Number.isFinite(requested)
      ? PREMIUM_RETENTION_BATCH_DEFAULT_LIMIT
      : Math.floor(requested);
  if (raw < 1) return 1;
  return Math.min(raw, PREMIUM_RETENTION_BATCH_MAX_LIMIT);
}

function mapWorkRow(row: {
  id: string;
  owner_id: string;
  domain: string;
  domain_ref: string;
  status: string;
  retention_expires_at: string | null;
}): PremiumCleanupWork {
  return {
    id: row.id,
    ownerId: row.owner_id,
    domain: row.domain as "TAKE" | "STUDIO_PROJECT",
    domainRef: row.domain_ref,
    status: row.status as PremiumCleanupWork["status"],
    retentionExpiresAtMs: row.retention_expires_at
      ? new Date(row.retention_expires_at).getTime()
      : null,
  };
}

export async function listDuePremiumRetentionWorks(params: {
  limit: number;
  nowMs: number;
}): Promise<PremiumCleanupWork[]> {
  const admin = createPremiumRetentionWorkerClient();
  const nowIso = new Date(params.nowMs).toISOString();
  const limit = clampPremiumRetentionBatchLimit(params.limit);

  const { data, error } = await admin
    .from("premium_works")
    .select(
      "id, owner_id, domain, domain_ref, status, retention_expires_at",
    )
    .eq("status", "WORK_READY")
    .not("retention_expires_at", "is", null)
    .lte("retention_expires_at", nowIso)
    .order("retention_expires_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    mapWorkRow(row as Parameters<typeof mapWorkRow>[0]),
  );
}

async function defaultCountLinkedKeys(
  work: PremiumCleanupWork,
): Promise<number> {
  const admin = createPremiumRetentionWorkerClient();
  let query = admin
    .from("audio_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", work.ownerId)
    .is("deleted_at", null);
  if (work.domain === "TAKE") {
    query = query.eq("take_id", work.domainRef);
  } else {
    query = query.eq("project_id", work.domainRef);
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function createDefaultDeps(): PremiumRetentionSchedulerDeps {
  return {
    listDueWorks: listDuePremiumRetentionWorks,
    runCleanupForWork: runPremiumRetentionCleanupForWork,
    countLinkedKeys: defaultCountLinkedKeys,
  };
}

function emptyBatchResult(params: {
  runId: string;
  mode: PremiumRetentionSchedulerMode;
  lockScope: PremiumRetentionLockScope;
  startedAt: string;
  startedMs: number;
  limit: number;
  lockAcquired: boolean;
  fencingToken: number | null;
  errorClass: string | null;
  leaseReleaseErrorClass?: string | null;
}): PremiumRetentionBatchResult {
  const finishedMs = Date.now();
  return {
    runId: params.runId,
    mode: params.mode,
    lockScope: params.lockScope,
    lockAcquired: params.lockAcquired,
    fencingToken: params.fencingToken,
    startedAt: params.startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: finishedMs - params.startedMs,
    limit: params.limit,
    scanned: 0,
    qualified: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    purgeComplete: 0,
    purgeIncomplete: 0,
    alreadyExpired: 0,
    truncated: false,
    errorClass: params.errorClass,
    leaseReleaseErrorClass: params.leaseReleaseErrorClass ?? null,
    works: [],
  };
}

function isPositiveIntTtl(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

async function resolveAcquire(
  lease: PremiumRetentionLeaseClient,
  runId: string,
  ttlSeconds: number,
): Promise<
  PremiumRetentionLeaseCallResult<{
    acquired: boolean;
    reason: string;
    fencingToken: number | null;
  }>
> {
  let result = await lease.acquire({ runId, ttlSeconds });
  if (result.status === "ambiguous") {
    result = await lease.resolveAmbiguousAcquire({ runId, ttlSeconds });
  }
  if (result.status !== "ok") return result;
  return {
    status: "ok",
    value: {
      acquired: result.value.acquired,
      reason: result.value.reason,
      fencingToken: result.value.fencingToken,
    },
  };
}

async function resolveRenew(
  lease: PremiumRetentionLeaseClient,
  runId: string,
  fencingToken: number,
  ttlSeconds: number,
): Promise<{ ok: true } | { ok: false; errorClass: string }> {
  let result = await lease.renew({ runId, fencingToken, ttlSeconds });
  if (result.status === "ambiguous") {
    result = await lease.resolveAmbiguousRenew({ runId, fencingToken });
  }
  if (result.status === "ambiguous") {
    return { ok: false, errorClass: "LEASE_RENEW_AMBIGUOUS" };
  }
  if (result.status === "error") {
    return { ok: false, errorClass: "LEASE_RENEW_FAILED" };
  }
  if (!result.value.renewed) {
    return { ok: false, errorClass: "LEASE_LOST" };
  }
  return { ok: true };
}

async function safeRelease(params: {
  lease: PremiumRetentionLeaseClient;
  runId: string;
  fencingToken: number;
}): Promise<string | null> {
  const result = await params.lease.release({
    runId: params.runId,
    fencingToken: params.fencingToken,
  });
  if (result.status === "ok") {
    // RELEASED or NOT_HOLDER (already stolen) — both safe; no foreign-lease free.
    return null;
  }
  if (result.status === "ambiguous") {
    return "LEASE_RELEASE_AMBIGUOUS";
  }
  return "LEASE_RELEASE_FAILED";
}

/**
 * Run one bounded Premium Retention batch.
 * dry-run: planner + optional read-only key counts; never invokes executor; never touches lease.
 * active: requires validated workLimits + leaseTtlSeconds; L1 lease then executor.
 */
export async function runPremiumRetentionCleanupBatch(params: {
  mode: PremiumRetentionSchedulerMode;
  limit?: number;
  nowMs?: number;
  runId?: string;
  deps?: PremiumRetentionSchedulerDeps;
  /**
   * Required for active (GO-72 / OD-62-03 A): finite pageSize, maxKeysPerWork, deadlineMs.
   * Optional for dry-run only. Production numbers remain PROVISIONAL until Owner APPROVE.
   */
  workLimits?: PremiumRetentionHybridLimits;
  /**
   * Required for active distributed lease (OD-62-06 HOLD).
   * Must be a positive integer. Callers (tests) pass synthetic values explicitly.
   * Cron without this value fail-closes active mode until OD-62-06 + wiring GO.
   */
  leaseTtlSeconds?: number;
}): Promise<PremiumRetentionBatchResult> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const runId = params.runId ?? randomUUID();
  const nowMs = params.nowMs ?? startedMs;
  const limit = clampPremiumRetentionBatchLimit(params.limit);
  const deps = params.deps ?? createDefaultDeps();

  if (processLockHeld) {
    return emptyBatchResult({
      runId,
      mode: params.mode,
      lockScope: "process",
      startedAt,
      startedMs,
      limit,
      lockAcquired: false,
      fencingToken: null,
      errorClass: "LOCK_NOT_ACQUIRED",
    });
  }

  processLockHeld = true;

  let fencingToken: number | null = null;
  let releaseToken: number | null = null;
  let leaseClient: PremiumRetentionLeaseClient | null = null;
  let shouldRelease = false;
  let lockScope: PremiumRetentionLockScope = "process";
  let result: PremiumRetentionBatchResult | null = null;
  /** Validated active limits only — never unbounded fallbacks. */
  let activeLimits: PremiumRetentionActiveWorkLimits | null = null;

  try {
    if (params.mode === "active") {
      const limitsCheck = validatePremiumRetentionActiveWorkLimits(
        params.workLimits,
      );
      if (!limitsCheck.ok) {
        result = emptyBatchResult({
          runId,
          mode: params.mode,
          lockScope: "distributed_lease",
          startedAt,
          startedMs,
          limit,
          lockAcquired: false,
          fencingToken: null,
          errorClass: limitsCheck.errorClass,
        });
        return result;
      }
      activeLimits = limitsCheck.limits;

      if (
        isPremiumRetentionDeadlineExceeded(activeLimits.deadlineMs, nowMs) ||
        !canStartPremiumRetentionWorkWithinDeadline({
          deadlineMs: activeLimits.deadlineMs,
          clockMs: nowMs,
        })
      ) {
        result = emptyBatchResult({
          runId,
          mode: params.mode,
          lockScope: "distributed_lease",
          startedAt,
          startedMs,
          limit,
          lockAcquired: false,
          fencingToken: null,
          errorClass: "BATCH_DEADLINE",
        });
        return result;
      }

      if (!isPositiveIntTtl(params.leaseTtlSeconds)) {
        result = emptyBatchResult({
          runId,
          mode: params.mode,
          lockScope: "distributed_lease",
          startedAt,
          startedMs,
          limit,
          lockAcquired: false,
          fencingToken: null,
          errorClass: "LEASE_TTL_REQUIRED",
        });
        return result;
      }

      lockScope = "distributed_lease";
      leaseClient = deps.lease ?? createPremiumRetentionLeaseClient();
      const ttlSeconds = params.leaseTtlSeconds;

      const acquired = await resolveAcquire(leaseClient, runId, ttlSeconds);
      if (acquired.status === "ambiguous") {
        result = emptyBatchResult({
          runId,
          mode: params.mode,
          lockScope,
          startedAt,
          startedMs,
          limit,
          lockAcquired: false,
          fencingToken: null,
          errorClass: "LEASE_ACQUIRE_AMBIGUOUS",
        });
        return result;
      }
      if (acquired.status === "error") {
        result = emptyBatchResult({
          runId,
          mode: params.mode,
          lockScope,
          startedAt,
          startedMs,
          limit,
          lockAcquired: false,
          fencingToken: null,
          errorClass: "LEASE_ACQUIRE_FAILED",
        });
        return result;
      }
      if (!acquired.value.acquired || acquired.value.fencingToken == null) {
        result = emptyBatchResult({
          runId,
          mode: params.mode,
          lockScope,
          startedAt,
          startedMs,
          limit,
          lockAcquired: false,
          fencingToken: null,
          errorClass:
            acquired.value.reason === "HELD"
              ? "LEASE_HELD"
              : "LEASE_NOT_ACQUIRED",
        });
        return result;
      }

      fencingToken = acquired.value.fencingToken;
      releaseToken = fencingToken;
      shouldRelease = true;
    }

    const due = await deps.listDueWorks({ limit, nowMs });
    const truncated = due.length >= limit;

    let qualified = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let purgeComplete = 0;
    let purgeIncomplete = 0;
    let alreadyExpired = 0;
    const works: PremiumRetentionBatchWorkSummary[] = [];
    let errorClass: string | null = null;

    for (const work of due) {
      if (params.mode === "active" && activeLimits) {
        const clockMs = Date.now();
        if (
          isPremiumRetentionDeadlineExceeded(activeLimits.deadlineMs, clockMs) ||
          !canStartPremiumRetentionWorkWithinDeadline({
            deadlineMs: activeLimits.deadlineMs,
            clockMs,
          })
        ) {
          errorClass = "BATCH_DEADLINE";
          break;
        }
      }

      if (
        shouldRelease &&
        leaseClient &&
        fencingToken != null &&
        isPositiveIntTtl(params.leaseTtlSeconds)
      ) {
        const renewed = await resolveRenew(
          leaseClient,
          runId,
          fencingToken,
          params.leaseTtlSeconds,
        );
        if (!renewed.ok) {
          errorClass = renewed.errorClass;
          // Lost ownership — do not release (would NOT_HOLDER or risk nothing).
          shouldRelease = false;
          releaseToken = null;
          break;
        }
      }

      const plan = planPremiumWorkExpiry({ work, nowMs });
      if (!plan.markExpired) {
        skipped += 1;
        works.push({
          workId: work.id,
          outcome: plan.alreadyExpired ? "alreadyExpired" : "skipped",
          skippedReason: plan.skipReason,
          markedExpired: false,
        });
        if (plan.alreadyExpired) alreadyExpired += 1;
        continue;
      }

      qualified += 1;

      if (params.mode === "dry-run") {
        if (deps.countLinkedKeys) {
          try {
            await deps.countLinkedKeys(work);
          } catch {
            // Count failure must not become a mutating path.
          }
        }
        processed += 1;
        succeeded += 1;
        works.push({
          workId: work.id,
          outcome: "dryRunWouldExpire",
          skippedReason: null,
          markedExpired: false,
        });
        continue;
      }

      processed += 1;
      try {
        const cleanupResult = await deps.runCleanupForWork({
          workId: work.id,
          nowMs,
          // Active: always pass validated finite limits (never omit → unbounded).
          limits: activeLimits ?? undefined,
          // H2-4: pass L2 fence while we still hold the distributed lease.
          leaseFence:
            shouldRelease && fencingToken != null
              ? { runId, fencingToken }
              : undefined,
        });
        works.push({
          workId: work.id,
          outcome: cleanupResult.outcome,
          skippedReason: cleanupResult.skippedReason,
          markedExpired: cleanupResult.markedExpired,
          budgetHit: cleanupResult.budgetHit,
          deadlineHit: cleanupResult.deadlineHit,
        });

        if (cleanupResult.outcome === "purgeComplete") {
          purgeComplete += 1;
          succeeded += 1;
        } else if (cleanupResult.outcome === "purgeIncomplete") {
          purgeIncomplete += 1;
          succeeded += 1;
        } else if (cleanupResult.outcome === "alreadyExpired") {
          alreadyExpired += 1;
          succeeded += 1;
        } else if (cleanupResult.outcome === "skipped") {
          skipped += 1;
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        errorClass = "WORK_EXECUTOR_ERROR";
        works.push({
          workId: work.id,
          outcome: "executorError",
          skippedReason:
            err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN",
          markedExpired: false,
        });
      }
    }

    const finishedMs = Date.now();
    result = {
      runId,
      mode: params.mode,
      lockScope,
      lockAcquired: true,
      fencingToken,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      durationMs: finishedMs - startedMs,
      limit,
      scanned: due.length,
      qualified,
      processed,
      succeeded,
      failed,
      skipped,
      purgeComplete,
      purgeIncomplete,
      alreadyExpired,
      truncated,
      errorClass,
      leaseReleaseErrorClass: null,
      works,
    };
    return result;
  } catch (err) {
    const finishedMs = Date.now();
    result = {
      runId,
      mode: params.mode,
      lockScope,
      lockAcquired: true,
      fencingToken,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      durationMs: finishedMs - startedMs,
      limit,
      scanned: 0,
      qualified: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      purgeComplete: 0,
      purgeIncomplete: 0,
      alreadyExpired: 0,
      truncated: false,
      errorClass:
        err instanceof Error ? "BATCH_ABORT" : "BATCH_ABORT_UNKNOWN",
      leaseReleaseErrorClass: null,
      works: [],
    };
    return result;
  } finally {
    if (shouldRelease && leaseClient && releaseToken != null) {
      const releaseErr = await safeRelease({
        lease: leaseClient,
        runId,
        fencingToken: releaseToken,
      });
      if (result && releaseErr) {
        result.leaseReleaseErrorClass = releaseErr;
      }
    }
    processLockHeld = false;
  }
}

/** Structured, non-PII summary suitable for logs / HTTP response. */
export function summarizePremiumRetentionBatch(
  result: PremiumRetentionBatchResult,
): Record<string, unknown> {
  return {
    runId: result.runId,
    mode: result.mode,
    lockAcquired: result.lockAcquired,
    lockScope: result.lockScope,
    fencingToken: result.fencingToken,
    scanned: result.scanned,
    qualified: result.qualified,
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    purgeComplete: result.purgeComplete,
    purgeIncomplete: result.purgeIncomplete,
    alreadyExpired: result.alreadyExpired,
    truncated: result.truncated,
    durationMs: result.durationMs,
    errorClass: result.errorClass,
    leaseReleaseErrorClass: result.leaseReleaseErrorClass,
  };
}
