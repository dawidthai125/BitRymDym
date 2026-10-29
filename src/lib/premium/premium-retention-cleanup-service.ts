/**
 * PREMIUM-03/09/20 / GO-PREMIUM-56 Wave H1 — Retention cleanup executor (policy A fail-closed).
 * Reuses pure planner; deletes only known audio_artifacts object keys for the work.
 * Scope: premium_works + linked artifacts for domain_ref (take_id | project_id) — no MIX, no mass delete.
 *
 * H1 hybrid (D48): in-run keyset pages on audio_artifacts.id, injectable work budget/deadline,
 * final alive=0 re-list before EXPIRED. No durable cursor.
 *
 * G3-TCB / G4-L (PREMIUM_RETENTION_FENCING_CONTRACT.md): runs as premium_retention_worker
 * (no table DML). Every logical delete is a fenced RPC (lease+token checked in the same
 * DB transaction as the effect):
 *   - artifact soft-delete → premium_retention_soft_delete_artifact_if_lease
 *   - WORK_READY→EXPIRED   → premium_retention_mark_expired_if_lease (L2)
 * leaseFence is required before the first effect. Storage DELETE is G4-P (not fenced).
 *
 * EXPIRED only when: no errors, no budget/deadline stop, final alive count = 0,
 * L2 mark returns MARKED_EXPIRED.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import {
  planPremiumWorkExpiry,
  type PremiumCleanupWork,
} from "@/lib/premium/premium-retention-cleanup";
import {
  createPremiumRetentionLeaseClient,
  isValidPremiumRetentionLeaseFence,
  PREMIUM_RETENTION_LEASE_LOST_REASONS,
  type PremiumRetentionLeaseClient,
  type PremiumRetentionLeaseFence,
} from "@/lib/premium/premium-retention-lease";
import { createPremiumRetentionWorkerClient } from "@/lib/supabase/premium-retention-worker-client";

export type PremiumRetentionCleanupOutcome =
  | "purgeComplete"
  | "purgeIncomplete"
  | "skipped"
  | "alreadyExpired";

/**
 * Injectable per-work limits. Numeric production values remain UNKNOWN/PROVISIONAL
 * (D48-02/03) — callers must pass explicit values when constraining; defaults are
 * compatibility fallbacks only, not Owner-approved prod parameters.
 */
export type PremiumRetentionHybridLimits = {
  /** Keyset page size (audio_artifacts rows). */
  pageSize?: number;
  /** Max artifact keys attempted this run (Storage remove attempts). */
  maxKeysPerWork?: number;
  /** Absolute wall-clock deadline (Date.now()-compatible ms). */
  deadlineMs?: number | null;
};

/**
 * Internal fallback page size when caller omits pageSize.
 * NOT a production-approved parameter (D48-02).
 */
export const PREMIUM_RETENTION_HYBRID_PAGE_SIZE_FALLBACK = 500;

export type PremiumRetentionCleanupResult = {
  workId: string;
  markedExpired: boolean;
  alreadyExpired: boolean;
  skippedReason: string | null;
  deletedObjectKeys: string[];
  storageErrors: string[];
  softDeleteErrors: string[];
  listErrors: string[];
  outcome: PremiumRetentionCleanupOutcome;
  pages: number;
  keysAttempted: number;
  keysSettled: number;
  budgetHit: boolean;
  deadlineHit: boolean;
  finalAlive: number | null;
  casConflict: boolean;
  /** True when L2 lease fence rejected the EXPIRED mark (stale/missing/expired lease). */
  leaseLost: boolean;
};

type LinkedArtifactRow = {
  id: string;
  bucket: string;
  key: string;
};

/**
 * Idempotent Storage remove success — mirror takes-janitor not-found handling.
 * Ambiguous / network / permission messages must NOT match.
 */
export function isStorageRemoveIdempotentSuccess(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("does not exist") ||
    msg.includes("404")
  );
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

function resolvePageSize(limits?: PremiumRetentionHybridLimits): number {
  const raw = limits?.pageSize;
  if (raw == null || !Number.isFinite(raw)) {
    return PREMIUM_RETENTION_HYBRID_PAGE_SIZE_FALLBACK;
  }
  const n = Math.floor(raw);
  return n < 1 ? 1 : n;
}

function resolveMaxKeys(limits?: PremiumRetentionHybridLimits): number {
  const raw = limits?.maxKeysPerWork;
  if (raw == null || !Number.isFinite(raw)) {
    return Number.POSITIVE_INFINITY;
  }
  const n = Math.floor(raw);
  return n < 0 ? 0 : n;
}

function emptyMetrics(): Pick<
  PremiumRetentionCleanupResult,
  | "listErrors"
  | "pages"
  | "keysAttempted"
  | "keysSettled"
  | "budgetHit"
  | "deadlineHit"
  | "finalAlive"
  | "casConflict"
  | "leaseLost"
> {
  return {
    listErrors: [],
    pages: 0,
    keysAttempted: 0,
    keysSettled: 0,
    budgetHit: false,
    deadlineHit: false,
    finalAlive: null,
    casConflict: false,
    leaseLost: false,
  };
}

function skippedResult(
  workId: string,
  params: {
    alreadyExpired: boolean;
    skippedReason: string | null;
    outcome: "skipped" | "alreadyExpired";
  },
): PremiumRetentionCleanupResult {
  return {
    workId,
    markedExpired: false,
    alreadyExpired: params.alreadyExpired,
    skippedReason: params.skippedReason,
    deletedObjectKeys: [],
    storageErrors: [],
    softDeleteErrors: [],
    outcome: params.outcome,
    ...emptyMetrics(),
  };
}

function incompleteResult(
  workId: string,
  partial: Omit<
    PremiumRetentionCleanupResult,
    "workId" | "markedExpired" | "alreadyExpired" | "skippedReason" | "outcome"
  >,
): PremiumRetentionCleanupResult {
  return {
    workId,
    markedExpired: false,
    alreadyExpired: false,
    skippedReason: null,
    outcome: "purgeIncomplete",
    ...partial,
  };
}

type WorkerClient = SupabaseClient;

/** Soft-delete rejections meaning the work itself is no longer eligible — stop this work. */
const SOFT_DELETE_WORK_STOP_REASONS: ReadonlySet<string> = new Set([
  "WORK_NOT_FOUND",
  "NOT_WORK_READY",
  "RETENTION_NOT_DUE",
]);

/**
 * Keyset page over linked alive audio_artifacts (DB), not Storage listing.
 * Storage API has no ordered keyset for this scope — enumeration is DB-authoritative
 * via audio_artifacts.id (uuid PK).
 */
async function listLinkedAlivePage(
  admin: WorkerClient,
  params: {
    ownerId: string;
    domain: "TAKE" | "STUDIO_PROJECT";
    domainRef: string;
    afterId: string | null;
    pageSize: number;
  },
): Promise<{ rows: LinkedArtifactRow[]; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST filter builder chain
  let query: any = admin
    .from("audio_artifacts")
    .select("id, storage_bucket, object_key, deleted_at")
    .eq("owner_id", params.ownerId)
    .is("deleted_at", null);
  if (params.domain === "TAKE") {
    query = query.eq("take_id", params.domainRef);
  } else {
    query = query.eq("project_id", params.domainRef);
  }
  if (params.afterId) {
    query = query.gt("id", params.afterId);
  }
  const { data, error } = await query
    .order("id", { ascending: true })
    .limit(params.pageSize);

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: LinkedArtifactRow[] = [];
  for (const row of data ?? []) {
    const id = row.id as string | null;
    const key = row.object_key as string | null;
    const bucket =
      (row.storage_bucket as string | null) ?? AUDIO_ARTIFACTS_BUCKET;
    if (id && key) {
      rows.push({ id, bucket, key });
    }
  }
  return { rows, error: null };
}

async function countLinkedAlive(
  admin: WorkerClient,
  params: {
    ownerId: string;
    domain: "TAKE" | "STUDIO_PROJECT";
    domainRef: string;
  },
): Promise<{ count: number | null; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST filter builder chain
  let query: any = admin
    .from("audio_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", params.ownerId)
    .is("deleted_at", null);
  if (params.domain === "TAKE") {
    query = query.eq("take_id", params.domainRef);
  } else {
    query = query.eq("project_id", params.domainRef);
  }
  const { count, error } = await query;
  if (error) {
    return { count: null, error: error.message };
  }
  // GO-58 F-1: never coerce null/ambiguous count to 0 — that could false-EXPIRED.
  if (
    count == null ||
    typeof count !== "number" ||
    !Number.isFinite(count) ||
    count < 0 ||
    !Number.isInteger(count)
  ) {
    return { count: null, error: "AMBIGUOUS_ALIVE_COUNT" };
  }
  return { count, error: null };
}

function deadlineExceeded(
  deadlineMs: number | null | undefined,
  clockMs: number,
): boolean {
  return deadlineMs != null && Number.isFinite(deadlineMs) && clockMs >= deadlineMs;
}

/**
 * Run cleanup for one premium_works id (premium_retention_worker). Idempotent.
 * Policy A + H1 final re-list: do not mark EXPIRED unless alive=0 after purge path.
 * Logical deletes only via fenced RPCs; missing/invalid leaseFence → no effects.
 */
export async function runPremiumRetentionCleanupForWork(params: {
  workId: string;
  nowMs?: number;
  limits?: PremiumRetentionHybridLimits;
  /** Test seam: override clock for deadline checks (defaults to Date.now). */
  clockMs?: () => number;
  /**
   * Fence from scheduler lease holder. Required before any Storage or DB effect.
   * Omission → fail-closed incomplete (LEASE_FENCE_REQUIRED), nothing deleted.
   */
  leaseFence?: PremiumRetentionLeaseFence;
  /** Test seam: injectable lease client (defaults to worker RPC client). */
  lease?: PremiumRetentionLeaseClient;
}): Promise<PremiumRetentionCleanupResult> {
  const admin = createPremiumRetentionWorkerClient();
  const nowMs = params.nowMs ?? Date.now();
  const clock = params.clockMs ?? (() => Date.now());
  const pageSize = resolvePageSize(params.limits);
  const maxKeys = resolveMaxKeys(params.limits);
  const deadlineMs = params.limits?.deadlineMs ?? null;

  const { data: row, error } = await admin
    .from("premium_works")
    .select(
      "id, owner_id, domain, domain_ref, status, retention_expires_at",
    )
    .eq("id", params.workId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    return skippedResult(params.workId, {
      alreadyExpired: false,
      skippedReason: "WORK_NOT_FOUND",
      outcome: "skipped",
    });
  }

  const work = mapWorkRow(row as Parameters<typeof mapWorkRow>[0]);
  const plan = planPremiumWorkExpiry({ work, nowMs });
  if (!plan.markExpired) {
    return skippedResult(work.id, {
      alreadyExpired: plan.alreadyExpired,
      skippedReason: plan.skipReason,
      outcome: plan.alreadyExpired ? "alreadyExpired" : "skipped",
    });
  }

  const fence = params.leaseFence;
  if (!isValidPremiumRetentionLeaseFence(fence)) {
    return incompleteResult(work.id, {
      deletedObjectKeys: [],
      storageErrors: [],
      softDeleteErrors: [],
      ...emptyMetrics(),
      listErrors: ["LEASE_FENCE_REQUIRED"],
      leaseLost: true,
    });
  }
  const fenceRunId = fence.runId.trim();
  const lease = params.lease ?? createPremiumRetentionLeaseClient();

  const deletedObjectKeys: string[] = [];
  const storageErrors: string[] = [];
  const softDeleteErrors: string[] = [];
  const listErrors: string[] = [];
  let pages = 0;
  let keysAttempted = 0;
  let keysSettled = 0;
  let budgetHit = false;
  let deadlineHit = false;
  let leaseLost = false;
  let afterId: string | null = null;

  // Keyset pages within this run only — no durable cursor between invocations.
  // List with full pageSize; apply maxKeys only when attempting Storage deletes
  // so end-of-set detection (short page) is not confused with budget caps.
  pageLoop: while (true) {
    if (deadlineExceeded(deadlineMs, clock())) {
      deadlineHit = true;
      break;
    }

    const page = await listLinkedAlivePage(admin, {
      ownerId: work.ownerId,
      domain: work.domain,
      domainRef: work.domainRef,
      afterId,
      pageSize,
    });
    if (page.error) {
      listErrors.push(page.error);
      break;
    }
    pages += 1;

    if (page.rows.length === 0) {
      break;
    }

    let pageFullySettled = true;
    let lastSettledId: string | null = null;
    let stoppedEarly = false;

    for (const obj of page.rows) {
      if (deadlineExceeded(deadlineMs, clock())) {
        deadlineHit = true;
        pageFullySettled = false;
        stoppedEarly = true;
        break;
      }
      if (keysAttempted >= maxKeys) {
        budgetHit = true;
        pageFullySettled = false;
        stoppedEarly = true;
        break;
      }

      keysAttempted += 1;

      const { error: rmErr } = await admin.storage
        .from(obj.bucket)
        .remove([obj.key]);

      if (rmErr) {
        if (!isStorageRemoveIdempotentSuccess(rmErr.message)) {
          storageErrors.push(rmErr.message);
          pageFullySettled = false;
          // Do not soft-delete; do not advance keyset past unsettled.
          continue;
        }
        // not-found → idempotent success; still soft-delete DB row if present
      }

      const soft = await lease.softDeleteArtifactIfLease({
        workId: work.id,
        artifactId: obj.id,
        runId: fenceRunId,
        fencingToken: fence.fencingToken,
      });

      if (soft.status === "ambiguous") {
        softDeleteErrors.push("SOFT_DELETE_AMBIGUOUS");
        pageFullySettled = false;
        stoppedEarly = true;
        break;
      }
      if (soft.status === "error") {
        // No confirmed fence: further Storage removes would run without lease authority.
        softDeleteErrors.push(soft.message);
        pageFullySettled = false;
        stoppedEarly = true;
        break;
      }
      if (!soft.value.ok) {
        const reason = soft.value.reason;
        softDeleteErrors.push(`SOFT_DELETE_${reason}`);
        pageFullySettled = false;
        if (PREMIUM_RETENTION_LEASE_LOST_REASONS.has(reason)) {
          leaseLost = true;
          stoppedEarly = true;
          break;
        }
        if (SOFT_DELETE_WORK_STOP_REASONS.has(reason)) {
          stoppedEarly = true;
          break;
        }
        continue;
      }

      deletedObjectKeys.push(obj.key);
      keysSettled += 1;
      lastSettledId = obj.id;
    }

    if (stoppedEarly || !pageFullySettled) {
      break pageLoop;
    }
    if (lastSettledId) {
      afterId = lastSettledId;
    }
    if (page.rows.length < pageSize) {
      break;
    }
  }

  const hasErrors =
    storageErrors.length > 0 ||
    softDeleteErrors.length > 0 ||
    listErrors.length > 0;

  if (hasErrors || budgetHit || deadlineHit) {
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors,
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit,
      finalAlive: null,
      casConflict: false,
      leaseLost,
    });
  }

  // GO-72: deadline also gates final re-list / L2 — never mark EXPIRED after wall budget.
  if (deadlineExceeded(deadlineMs, clock())) {
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors,
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit: true,
      finalAlive: null,
      casConflict: false,
      leaseLost: false,
    });
  }

  // Final verification — mandatory before EXPIRED (D42-04 / D48-04).
  const alive = await countLinkedAlive(admin, {
    ownerId: work.ownerId,
    domain: work.domain,
    domainRef: work.domainRef,
  });
  if (alive.error != null || alive.count == null) {
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors: [
        ...listErrors,
        alive.error ?? "AMBIGUOUS_ALIVE_COUNT",
      ],
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit,
      finalAlive: null,
      casConflict: false,
      leaseLost: false,
    });
  }

  const finalAlive = alive.count;
  if (finalAlive > 0) {
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors,
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit,
      finalAlive,
      casConflict: false,
      leaseLost: false,
    });
  }

  // GO-72: re-check deadline after re-list before L2 CAS.
  if (deadlineExceeded(deadlineMs, clock())) {
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors,
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit: true,
      finalAlive,
      casConflict: false,
      leaseLost: false,
    });
  }

  // H2-4 L2 — never bare PostgREST EXPIRED update (lease+token must be atomic in DB).
  const mark = await lease.markExpiredIfLease({
    workId: work.id,
    runId: fenceRunId,
    fencingToken: fence.fencingToken,
  });

  if (mark.status === "ambiguous") {
    // Must not treat unknown outcome as EXPIRED (including "already expired" guess).
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors: [...listErrors, "MARK_EXPIRED_AMBIGUOUS"],
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit,
      finalAlive,
      casConflict: false,
      leaseLost: false,
    });
  }

  if (mark.status === "error") {
    return incompleteResult(work.id, {
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors: [...softDeleteErrors, mark.message],
      listErrors,
      pages,
      keysAttempted,
      keysSettled,
      budgetHit,
      deadlineHit,
      finalAlive,
      casConflict: false,
      leaseLost: false,
    });
  }

  const reason = mark.value.reason;
  if (reason === "MARKED_EXPIRED" && mark.value.ok) {
    return {
      workId: work.id,
      markedExpired: true,
      alreadyExpired: false,
      skippedReason: null,
      deletedObjectKeys,
      storageErrors,
      softDeleteErrors,
      listErrors,
      outcome: "purgeComplete",
      pages,
      keysAttempted,
      keysSettled,
      budgetHit: false,
      deadlineHit: false,
      finalAlive,
      casConflict: false,
      leaseLost: false,
    };
  }

  const casConflict =
    reason === "CAS_CONFLICT" ||
    reason === "ALREADY_EXPIRED" ||
    reason === "NOT_WORK_READY";

  return incompleteResult(work.id, {
    deletedObjectKeys,
    storageErrors,
    softDeleteErrors,
    listErrors: [...listErrors, `L2_${reason}`],
    pages,
    keysAttempted,
    keysSettled,
    budgetHit,
    deadlineHit,
    finalAlive,
    casConflict,
    leaseLost: PREMIUM_RETENTION_LEASE_LOST_REASONS.has(reason),
  });
}
