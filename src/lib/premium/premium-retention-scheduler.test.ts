/**
 * GO-PREMIUM-28 / GO-PREMIUM-67 H2-3 — Batch orchestrator unit tests
 * (mocked deps + lease; no live DB/Storage).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PremiumCleanupWork } from "@/lib/premium/premium-retention-cleanup";
import type { PremiumRetentionCleanupResult } from "@/lib/premium/premium-retention-cleanup-service";
import { isStorageRemoveIdempotentSuccess } from "@/lib/premium/premium-retention-cleanup-service";
import {
  PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS,
  type PremiumRetentionLeaseClient,
} from "@/lib/premium/premium-retention-lease";
import {
  buildProvisionalTestWorkLimits,
} from "@/lib/premium/premium-retention-work-limits";
import {
  __resetPremiumRetentionProcessLockForTests,
  clampPremiumRetentionBatchLimit,
  PREMIUM_RETENTION_BATCH_DEFAULT_LIMIT,
  PREMIUM_RETENTION_BATCH_MAX_LIMIT,
  runPremiumRetentionCleanupBatch,
  summarizePremiumRetentionBatch,
} from "@/lib/premium/premium-retention-scheduler";

const NOW_MS = Date.parse("2026-10-22T00:00:00.000Z");
/** Synthetic TTL for tests only — not OD-62-06 approved. */
const SYNTHETIC_TTL = PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS;
/** Deadline far past fixture NOW_MS so live Date.now() in the work loop cannot expire it. */
const SYNTHETIC_LIMITS = buildProvisionalTestWorkLimits({
  nowMs: NOW_MS,
  deadlineDurationMs: 7 * 86_400_000,
});

function dueWork(
  id: string,
  overrides: Partial<PremiumCleanupWork> = {},
): PremiumCleanupWork {
  return {
    id,
    ownerId: "owner-1",
    domain: "STUDIO_PROJECT",
    domainRef: `proj-${id}`,
    status: "WORK_READY",
    retentionExpiresAtMs: NOW_MS - 60_000,
    ...overrides,
  };
}

function okComplete(workId: string): PremiumRetentionCleanupResult {
  return {
    workId,
    markedExpired: true,
    alreadyExpired: false,
    skippedReason: null,
    deletedObjectKeys: [`k-${workId}`],
    storageErrors: [],
    softDeleteErrors: [],
    listErrors: [],
    outcome: "purgeComplete",
    pages: 1,
    keysAttempted: 1,
    keysSettled: 1,
    budgetHit: false,
    deadlineHit: false,
    finalAlive: 0,
    casConflict: false,
    leaseLost: false,
  };
}

function incompleteAckLoss(workId: string): PremiumRetentionCleanupResult {
  return {
    workId,
    markedExpired: false,
    alreadyExpired: false,
    skippedReason: null,
    deletedObjectKeys: [],
    storageErrors: ["P27 injected ack-loss after upstream DELETE"],
    softDeleteErrors: [],
    listErrors: [],
    outcome: "purgeIncomplete",
    pages: 1,
    keysAttempted: 1,
    keysSettled: 0,
    budgetHit: false,
    deadlineHit: false,
    finalAlive: null,
    casConflict: false,
    leaseLost: false,
  };
}

function createMockLease(
  overrides: Partial<PremiumRetentionLeaseClient> = {},
): PremiumRetentionLeaseClient {
  const acquire = vi.fn(async () => ({
    status: "ok" as const,
    value: {
      acquired: true,
      reason: "ACQUIRED" as const,
      fencingToken: 1,
      leaseExpiresAt: "2026-10-22T00:01:00.000Z",
      holderRunId: "run",
    },
  }));
  const renew = vi.fn(async () => ({
    status: "ok" as const,
    value: {
      renewed: true,
      reason: "RENEWED" as const,
      fencingToken: 1,
      leaseExpiresAt: "2026-10-22T00:01:00.000Z",
      holderRunId: "run",
    },
  }));
  const release = vi.fn(async () => ({
    status: "ok" as const,
    value: {
      released: true,
      reason: "RELEASED" as const,
      fencingToken: 1,
    },
  }));
  const get = vi.fn(async () => ({
    status: "ok" as const,
    value: {
      lockKey: "premium_retention_cleanup",
      fencingToken: 1,
      holderRunId: "run",
      leaseExpiresAt: "2026-10-22T00:01:00.000Z",
      acquiredAt: "2026-10-22T00:00:00.000Z",
      heartbeatAt: "2026-10-22T00:00:00.000Z",
      isExpired: false,
    },
  }));
  const markExpiredIfLease = vi.fn(async ({ workId }: { workId: string }) => ({
    status: "ok" as const,
    value: {
      ok: true,
      reason: "MARKED_EXPIRED" as const,
      workId,
    },
  }));
  return {
    acquire,
    renew,
    release,
    get,
    markExpiredIfLease,
    resolveAmbiguousAcquire: vi.fn(async () => acquire()),
    resolveAmbiguousRenew: vi.fn(async () => renew()),
    ...overrides,
  };
}

afterEach(() => {
  __resetPremiumRetentionProcessLockForTests();
});

describe("clampPremiumRetentionBatchLimit", () => {
  it("defaults and hard-caps", () => {
    expect(clampPremiumRetentionBatchLimit()).toBe(
      PREMIUM_RETENTION_BATCH_DEFAULT_LIMIT,
    );
    expect(clampPremiumRetentionBatchLimit(0)).toBe(1);
    expect(clampPremiumRetentionBatchLimit(10_000)).toBe(
      PREMIUM_RETENTION_BATCH_MAX_LIMIT,
    );
  });
});

describe("runPremiumRetentionCleanupBatch", () => {
  it("handles empty due set", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      runId: "run-empty",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.scanned).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.lockAcquired).toBe(true);
    expect(result.lockScope).toBe("distributed_lease");
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it("respects batch limit and sets truncated when page is full", async () => {
    const lease = createMockLease();
    const works = Array.from({ length: 3 }, (_, i) => dueWork(`w${i}`));
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      limit: 3,
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async ({ limit }) => {
          expect(limit).toBe(3);
          return works.slice(0, limit);
        },
        runCleanupForWork,
        lease,
      },
    });
    expect(result.scanned).toBe(3);
    expect(result.limit).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.purgeComplete).toBe(3);
    expect(runCleanupForWork).toHaveBeenCalledTimes(3);
    expect(lease.renew).toHaveBeenCalledTimes(3);
  });

  it("continues after a single executor throw", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) => {
      if (workId === "w-bad") throw new Error("boom");
      return okComplete(workId);
    });
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w-bad"), dueWork("w-ok")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.failed).toBe(1);
    expect(result.purgeComplete).toBe(1);
    expect(result.errorClass).toBe("WORK_EXECUTOR_ERROR");
    expect(result.works.map((w) => w.outcome)).toEqual([
      "executorError",
      "purgeComplete",
    ]);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it("aborts the batch when listDueWorks throws after the lease", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      limit: 3,
      nowMs: NOW_MS,
      runId: "run-batch-abort",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => {
          throw new Error("list failed");
        },
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("BATCH_ABORT");
    expect(result.limit).toBe(3);
    expect(result.scanned).toBe(0);
    expect(result.qualified).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.purgeComplete).toBe(0);
    expect(result.purgeIncomplete).toBe(0);
    expect(result.alreadyExpired).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.works).toEqual([]);
    expect(result.lockAcquired).toBe(true);
    expect(result.lockScope).toBe("distributed_lease");
    expect(result.fencingToken).toBe(1);
    expect(result.leaseReleaseErrorClass).toBeNull();
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    expect(lease.renew).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledWith({
      runId: "run-batch-abort",
      fencingToken: 1,
    });
  });

  it("E01 omits workLimits → WORK_LIMITS_REQUIRED fail-closed (GO-72)", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_LIMITS_REQUIRED");
    expect(result.lockAcquired).toBe(false);
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).not.toHaveBeenCalled();
  });

  it("E02 forwards validated workLimits to executor", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const workLimits = {
      pageSize: 7,
      maxKeysPerWork: 1,
      deadlineMs: NOW_MS + 7 * 86_400_000,
    };
    await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      workLimits,
      leaseTtlSeconds: SYNTHETIC_TTL,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(runCleanupForWork).toHaveBeenCalledTimes(1);
    expect(runCleanupForWork.mock.calls[0]![0].limits).toEqual(workLimits);
  });

  it("dry-run never invokes mutating executor or lease", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const countLinkedKeys = vi.fn(async () => 2);
    const result = await runPremiumRetentionCleanupBatch({
      mode: "dry-run",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        countLinkedKeys,
        lease,
      },
    });
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).not.toHaveBeenCalled();
    expect(lease.renew).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
    expect(countLinkedKeys).toHaveBeenCalledTimes(2);
    expect(result.mode).toBe("dry-run");
    expect(result.lockScope).toBe("process");
    expect(result.qualified).toBe(2);
    expect(result.works.every((w) => w.outcome === "dryRunWouldExpire")).toBe(
      true,
    );
    expect(result.works.every((w) => w.markedExpired === false)).toBe(true);
  });

  it("process lock rejects overlapping run (same isolate)", async () => {
    const lease = createMockLease();
    let releaseGate!: () => void;
    const gate = new Promise<void>((r) => {
      releaseGate = r;
    });
    const first = runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => {
          await gate;
          return [dueWork("w1")];
        },
        runCleanupForWork: async ({ workId }) => okComplete(workId),
        lease,
      },
    });
    const second = await runPremiumRetentionCleanupBatch({
      mode: "dry-run",
      nowMs: NOW_MS,
      deps: {
        listDueWorks: async () => [dueWork("w2")],
        runCleanupForWork: vi.fn(),
      },
    });
    expect(second.lockAcquired).toBe(false);
    expect(second.errorClass).toBe("LOCK_NOT_ACQUIRED");
    releaseGate();
    const firstResult = await first;
    expect(firstResult.lockAcquired).toBe(true);
    expect(firstResult.purgeComplete).toBe(1);
  });

  it("GO-27 regression: purgeIncomplete (ack-loss) does not count as EXPIRED mark", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) =>
      incompleteAckLoss(workId),
    );
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("ack")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.purgeIncomplete).toBe(1);
    expect(result.purgeComplete).toBe(0);
    expect(result.works[0]?.markedExpired).toBe(false);
    expect(result.works[0]?.outcome).toBe("purgeIncomplete");
  });

  it("GO-27 retry semantics: not-found classifier remains idempotent success", () => {
    expect(isStorageRemoveIdempotentSuccess("Object not found")).toBe(true);
    expect(
      isStorageRemoveIdempotentSuccess(
        "P27 injected ack-loss after upstream DELETE",
      ),
    ).toBe(false);
  });

  it("summarize omits per-work ids (counts only)", () => {
    const summary = summarizePremiumRetentionBatch({
      runId: "r1",
      mode: "dry-run",
      lockAcquired: true,
      lockScope: "process",
      fencingToken: null,
      startedAt: "t0",
      finishedAt: "t1",
      durationMs: 1,
      limit: 50,
      scanned: 1,
      qualified: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      purgeComplete: 0,
      purgeIncomplete: 0,
      alreadyExpired: 0,
      truncated: false,
      errorClass: null,
      leaseReleaseErrorClass: null,
      works: [
        {
          workId: "secret-work",
          outcome: "dryRunWouldExpire",
          skippedReason: null,
          markedExpired: false,
        },
      ],
    });
    expect(summary).not.toHaveProperty("works");
    expect(JSON.stringify(summary)).not.toContain("secret-work");
  });

  it("skips NOT_DUE works without calling executor", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [
          dueWork("future", { retentionExpiresAtMs: NOW_MS + 86_400_000 }),
        ],
        runCleanupForWork,
        lease,
      },
    });
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.qualified).toBe(0);
    expect(lease.renew).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});

describe("GO-PREMIUM-67 H2-3 — distributed lease L1", () => {
  it("1 acquire success → cleanup starts", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      runId: "run-ok",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.lockAcquired).toBe(true);
    expect(result.lockScope).toBe("distributed_lease");
    expect(result.fencingToken).toBe(1);
    expect(runCleanupForWork).toHaveBeenCalledTimes(1);
    expect(lease.acquire).toHaveBeenCalledTimes(1);
  });

  it("2 acquire conflict HELD → no cleanup", async () => {
    const lease = createMockLease({
      acquire: vi.fn(async () => ({
        status: "ok" as const,
        value: {
          acquired: false,
          reason: "HELD" as const,
          fencingToken: null,
          leaseExpiresAt: "t",
          holderRunId: "other",
        },
      })),
    });
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.lockAcquired).toBe(false);
    expect(result.errorClass).toBe("LEASE_HELD");
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("3 acquire error → fail-closed", async () => {
    const lease = createMockLease({
      acquire: vi.fn(async () => ({
        status: "error" as const,
        errorClass: "UNKNOWN" as const,
        message: "rpc down",
      })),
    });
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_ACQUIRE_FAILED");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("4 ambiguous acquire unresolved → no cleanup", async () => {
    const lease = createMockLease({
      acquire: vi.fn(async () => ({
        status: "ambiguous" as const,
        operation: "acquire" as const,
        message: "timeout",
      })),
      resolveAmbiguousAcquire: vi.fn(async () => ({
        status: "ambiguous" as const,
        operation: "acquire" as const,
        message: "still unknown",
      })),
    });
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_ACQUIRE_AMBIGUOUS");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("5 renew success between works", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        lease,
      },
    });
    expect(lease.renew).toHaveBeenCalledTimes(2);
    expect(runCleanupForWork).toHaveBeenCalledTimes(2);
  });

  it("6 renew error → stop further cleanup", async () => {
    const lease = createMockLease({
      renew: vi.fn(async () => ({
        status: "error" as const,
        errorClass: "UNKNOWN" as const,
        message: "renew failed",
      })),
    });
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_RENEW_FAILED");
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("7 lease lost before next work → no further cleanup", async () => {
    let renewCount = 0;
    const lease = createMockLease({
      renew: vi.fn(async () => {
        renewCount += 1;
        if (renewCount === 1) {
          return {
            status: "ok" as const,
            value: {
              renewed: true,
              reason: "RENEWED" as const,
              fencingToken: 1,
              leaseExpiresAt: "t",
              holderRunId: "run",
            },
          };
        }
        return {
          status: "ok" as const,
          value: {
            renewed: false,
            reason: "LEASE_LOST" as const,
            fencingToken: null,
            leaseExpiresAt: null,
            holderRunId: null,
          },
        };
      }),
    });
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        lease,
      },
    });
    expect(runCleanupForWork).toHaveBeenCalledTimes(1);
    expect(result.errorClass).toBe("LEASE_LOST");
    expect(result.purgeComplete).toBe(1);
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("8 expiry-shaped renew fail mid-run", async () => {
    const lease = createMockLease({
      renew: vi.fn(async () => ({
        status: "ok" as const,
        value: {
          renewed: false,
          reason: "LEASE_LOST" as const,
          fencingToken: null,
          leaseExpiresAt: null,
          holderRunId: null,
        },
      })),
    });
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_LOST");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("9 two parallel actives — only lease holder cleans up", async () => {
    const holderLease = createMockLease();
    const heldLease = createMockLease({
      acquire: vi.fn(async () => ({
        status: "ok" as const,
        value: {
          acquired: false,
          reason: "HELD" as const,
          fencingToken: null,
          leaseExpiresAt: "t",
          holderRunId: "other",
        },
      })),
    });
    const cleanupA = vi.fn(async ({ workId }) => okComplete(workId));
    const cleanupB = vi.fn();
    const a = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      runId: "owner-run",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork: cleanupA,
        lease: holderLease,
      },
    });
    const b = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      runId: "other-run",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w2")],
        runCleanupForWork: cleanupB,
        lease: heldLease,
      },
    });
    expect(a.lockAcquired).toBe(true);
    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(b.lockAcquired).toBe(false);
    expect(b.errorClass).toBe("LEASE_HELD");
    expect(cleanupB).not.toHaveBeenCalled();
  });

  it("10 release after normal completion", async () => {
    const lease = createMockLease();
    await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      runId: "run-release",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork: async ({ workId }) => okComplete(workId),
        lease,
      },
    });
    expect(lease.release).toHaveBeenCalledWith({
      runId: "run-release",
      fencingToken: 1,
    });
  });

  it("11 release after executor exception", async () => {
    const lease = createMockLease();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      runId: "run-ex",
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork: async () => {
          throw new Error("boom");
        },
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_EXECUTOR_ERROR");
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it("12 release error does not mask primary error", async () => {
    const lease = createMockLease({
      release: vi.fn(async () => ({
        status: "error" as const,
        errorClass: "UNKNOWN" as const,
        message: "release failed",
      })),
    });
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork: async () => {
          throw new Error("primary");
        },
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_EXECUTOR_ERROR");
    expect(result.leaseReleaseErrorClass).toBe("LEASE_RELEASE_FAILED");
  });

  it("13 stale fencing / LEASE_LOST — no further processing", async () => {
    const lease = createMockLease({
      renew: vi.fn(async () => ({
        status: "ok" as const,
        value: {
          renewed: false,
          reason: "LEASE_LOST" as const,
          fencingToken: null,
          leaseExpiresAt: null,
          holderRunId: null,
        },
      })),
    });
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_LOST");
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("14 no double release; NOT_HOLDER release is ok without second call", async () => {
    const lease = createMockLease({
      release: vi.fn(async () => ({
        status: "ok" as const,
        value: {
          released: false,
          reason: "NOT_HOLDER" as const,
          fencingToken: null,
        },
      })),
    });
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork: async ({ workId }) => okComplete(workId),
        lease,
      },
    });
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(result.leaseReleaseErrorClass).toBeNull();
  });

  it("active without leaseTtlSeconds → LEASE_TTL_REQUIRED (OD-62-06 HOLD)", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      workLimits: SYNTHETIC_LIMITS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_TTL_REQUIRED");
    expect(result.lockAcquired).toBe(false);
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).not.toHaveBeenCalled();
  });
});
