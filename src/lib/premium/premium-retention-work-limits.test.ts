/**
 * GO-PREMIUM-72 — Active workLimits fail-closed + deadline gates (mocked).
 * Not live PostgreSQL.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PremiumCleanupWork } from "@/lib/premium/premium-retention-cleanup";
import type { PremiumRetentionCleanupResult } from "@/lib/premium/premium-retention-cleanup-service";
import {
  PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS,
  type PremiumRetentionLeaseClient,
} from "@/lib/premium/premium-retention-lease";
import {
  __resetPremiumRetentionProcessLockForTests,
  runPremiumRetentionCleanupBatch,
} from "@/lib/premium/premium-retention-scheduler";
import {
  buildProvisionalTestWorkLimits,
  PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_MAX_KEYS,
  PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_PAGE_SIZE,
  resolvePremiumRetentionWorkLimitsFromEnv,
  validatePremiumRetentionActiveWorkLimits,
} from "@/lib/premium/premium-retention-work-limits";

const NOW_MS = Date.parse("2026-10-22T12:00:00.000Z");
const SYNTHETIC_TTL = PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS;

function dueWork(id: string): PremiumCleanupWork {
  return {
    id,
    ownerId: "owner-1",
    domain: "STUDIO_PROJECT",
    domainRef: `proj-${id}`,
    status: "WORK_READY",
    retentionExpiresAtMs: NOW_MS - 60_000,
  };
}

function okComplete(workId: string): PremiumRetentionCleanupResult {
  return {
    workId,
    markedExpired: true,
    alreadyExpired: false,
    skippedReason: null,
    deletedObjectKeys: [],
    storageErrors: [],
    softDeleteErrors: [],
    listErrors: [],
    outcome: "purgeComplete",
    pages: 1,
    keysAttempted: 0,
    keysSettled: 0,
    budgetHit: false,
    deadlineHit: false,
    finalAlive: 0,
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
      leaseExpiresAt: "t",
      holderRunId: "run",
    },
  }));
  const renew = vi.fn(async () => ({
    status: "ok" as const,
    value: {
      renewed: true,
      reason: "RENEWED" as const,
      fencingToken: 1,
      leaseExpiresAt: "t",
      holderRunId: "run",
    },
  }));
  return {
    acquire,
    renew,
    release: vi.fn(async () => ({
      status: "ok" as const,
      value: {
        released: true,
        reason: "RELEASED" as const,
        fencingToken: 1,
      },
    })),
    get: vi.fn(async () => ({
      status: "ok" as const,
      value: {
        lockKey: "premium_retention_cleanup",
        fencingToken: 1,
        holderRunId: "run",
        leaseExpiresAt: "t",
        acquiredAt: "t",
        heartbeatAt: "t",
        isExpired: false,
      },
    })),
    markExpiredIfLease: vi.fn(async ({ workId }: { workId: string }) => ({
      status: "ok" as const,
      value: { ok: true, reason: "MARKED_EXPIRED" as const, workId },
    })),
    resolveAmbiguousAcquire: vi.fn(async () => acquire()),
    resolveAmbiguousRenew: vi.fn(async () => renew()),
    ...overrides,
  };
}

afterEach(() => {
  __resetPremiumRetentionProcessLockForTests();
});

describe("GO-72 validatePremiumRetentionActiveWorkLimits", () => {
  it("rejects missing / incomplete / unbounded", () => {
    expect(validatePremiumRetentionActiveWorkLimits(undefined).ok).toBe(false);
    expect(
      validatePremiumRetentionActiveWorkLimits({
        maxKeysPerWork: 25,
        deadlineMs: NOW_MS + 1,
      } as never).errorClass,
    ).toBe("WORK_LIMITS_PAGE_SIZE_INVALID");
    expect(
      validatePremiumRetentionActiveWorkLimits({
        pageSize: 50,
        deadlineMs: NOW_MS + 1,
      } as never).errorClass,
    ).toBe("WORK_LIMITS_MAX_KEYS_INVALID");
    expect(
      validatePremiumRetentionActiveWorkLimits({
        pageSize: 50,
        maxKeysPerWork: Number.POSITIVE_INFINITY,
        deadlineMs: NOW_MS + 1,
      }).errorClass,
    ).toBe("WORK_LIMITS_MAX_KEYS_INVALID");
    expect(
      validatePremiumRetentionActiveWorkLimits({
        pageSize: 50,
        maxKeysPerWork: 25,
        deadlineMs: null,
      }).errorClass,
    ).toBe("WORK_LIMITS_DEADLINE_INVALID");
  });

  it("accepts provisional finite set", () => {
    const limits = buildProvisionalTestWorkLimits({ nowMs: NOW_MS });
    expect(limits.pageSize).toBe(
      PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_PAGE_SIZE,
    );
    expect(limits.maxKeysPerWork).toBe(
      PREMIUM_RETENTION_WORK_LIMITS_PROVISIONAL_MAX_KEYS,
    );
    expect(validatePremiumRetentionActiveWorkLimits(limits).ok).toBe(true);
  });

  it("env resolver returns null when incomplete (no invented defaults)", () => {
    expect(resolvePremiumRetentionWorkLimitsFromEnv({})).toBeNull();
    expect(
      resolvePremiumRetentionWorkLimitsFromEnv({
        PREMIUM_RETENTION_WORK_PAGE_SIZE: "50",
      }),
    ).toBeNull();
  });
});

describe("GO-72 active scheduler workLimits matrix", () => {
  it("1 active without workLimits → reject before cleanup", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
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
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).not.toHaveBeenCalled();
  });

  it("2 missing pageSize", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: { maxKeysPerWork: 25, deadlineMs: NOW_MS + 60_000 },
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_LIMITS_PAGE_SIZE_INVALID");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("3 missing maxKeysPerWork", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: { pageSize: 50, deadlineMs: NOW_MS + 60_000 },
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_LIMITS_MAX_KEYS_INVALID");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("4 unbounded maxKeys Infinity rejected", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: {
        pageSize: 50,
        maxKeysPerWork: Number.POSITIVE_INFINITY,
        deadlineMs: NOW_MS + 60_000,
      },
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_LIMITS_MAX_KEYS_INVALID");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("5 invalid deadline", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: {
        pageSize: 50,
        maxKeysPerWork: 25,
        deadlineMs: Number.NaN,
      },
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("WORK_LIMITS_DEADLINE_INVALID");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("6 valid limits forwarded explicitly", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const workLimits = buildProvisionalTestWorkLimits({
      nowMs: NOW_MS,
      deadlineDurationMs: 7 * 86_400_000,
    });
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBeNull();
    expect(runCleanupForWork).toHaveBeenCalledTimes(1);
    expect(runCleanupForWork.mock.calls[0]![0].limits).toEqual(workLimits);
    expect(lease.acquire).toHaveBeenCalledTimes(1);
  });

  it("7 deadline exhausted before start → BATCH_DEADLINE, no cleanup", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: {
        pageSize: 50,
        maxKeysPerWork: 25,
        deadlineMs: NOW_MS - 1,
      },
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("BATCH_DEADLINE");
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).not.toHaveBeenCalled();
  });

  it("8 deadline between works stops further cleanup", async () => {
    const lease = createMockLease();
    const deadlineMs = NOW_MS + 10_000;
    let cleanupCalls = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => NOW_MS);
    const runCleanupForWork = vi.fn(async ({ workId }) => {
      cleanupCalls += 1;
      if (cleanupCalls === 1) {
        // After first work finishes, wall clock is past deadline for next gate.
        clock.mockImplementation(() => deadlineMs + 1);
      }
      return okComplete(workId);
    });

    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: { pageSize: 50, maxKeysPerWork: 25, deadlineMs },
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        lease,
      },
    });
    clock.mockRestore();
    expect(runCleanupForWork).toHaveBeenCalledTimes(1);
    expect(result.errorClass).toBe("BATCH_DEADLINE");
    expect(result.processed).toBe(1);
  });

  it("12 lease loss → no further work", async () => {
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
    const runCleanupForWork = vi.fn(async ({ workId }) => okComplete(workId));
    const result = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      leaseTtlSeconds: SYNTHETIC_TTL,
      workLimits: buildProvisionalTestWorkLimits({
        nowMs: NOW_MS,
        deadlineDurationMs: 7 * 86_400_000,
      }),
      deps: {
        listDueWorks: async () => [dueWork("w1"), dueWork("w2")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBe("LEASE_LOST");
    expect(runCleanupForWork).not.toHaveBeenCalled();
  });

  it("14 dry-run never mutates / ignores missing workLimits", async () => {
    const lease = createMockLease();
    const runCleanupForWork = vi.fn();
    const result = await runPremiumRetentionCleanupBatch({
      mode: "dry-run",
      nowMs: NOW_MS,
      deps: {
        listDueWorks: async () => [dueWork("w1")],
        runCleanupForWork,
        lease,
      },
    });
    expect(result.errorClass).toBeNull();
    expect(runCleanupForWork).not.toHaveBeenCalled();
    expect(lease.acquire).not.toHaveBeenCalled();
    expect(result.works[0]?.outcome).toBe("dryRunWouldExpire");
  });
});
