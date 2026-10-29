/**
 * GO-PREMIUM-56 Wave H1 — Hybrid executor matrix T00–T17 (mocked; no live DB/Storage).
 * Enumeration is DB keyset on audio_artifacts.id — not Storage list API.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { evaluatePremiumDownloadGate } from "@/lib/premium/premium-download-authz";

const fromMock = vi.hoisted(() => vi.fn());
const storageFromMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
const markExpiredIfLeaseMock = vi.hoisted(() =>
  vi.fn(async ({ workId }: { workId: string }) => ({
    status: "ok" as const,
    value: {
      ok: true,
      reason: "MARKED_EXPIRED" as const,
      workId,
    },
  })),
);


const softDeleteArtifactIfLeaseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/premium-retention-worker-client", () => ({
  createPremiumRetentionWorkerClient: () => ({
    from: fromMock,
    storage: { from: storageFromMock },
  }),
}));

vi.mock("@/lib/premium/premium-retention-lease", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/premium/premium-retention-lease")>();
  return {
    ...actual,
    createPremiumRetentionLeaseClient: () => ({
      acquire: vi.fn(),
      renew: vi.fn(),
      release: vi.fn(),
      get: vi.fn(),
      resolveAmbiguousAcquire: vi.fn(),
      resolveAmbiguousRenew: vi.fn(),
      markExpiredIfLease: markExpiredIfLeaseMock,
      softDeleteArtifactIfLease: softDeleteArtifactIfLeaseMock,
    }),
  };
});


import { runPremiumRetentionCleanupForWork } from "@/lib/premium/premium-retention-cleanup-service";
import {
  __resetPremiumRetentionProcessLockForTests,
  runPremiumRetentionCleanupBatch,
} from "@/lib/premium/premium-retention-scheduler";

const OWNER = "owner-1";
const WORK_ID = "work-1";
const TAKE_ID = "take-1";
const RETENTION_ISO = "2020-01-01T00:00:00.000Z";
const NOW_MS = Date.parse("2026-10-21T00:00:00.000Z");
const TEST_LEASE_FENCE = {
  runId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  fencingToken: 1,
} as const;


type ArtifactRow = {
  id: string;
  storage_bucket: string;
  object_key: string;
  deleted_at: string | null;
};

type WorkRow = {
  id: string;
  owner_id: string;
  domain: string;
  domain_ref: string;
  status: string;
  retention_expires_at: string | null;
};

function baseWork(overrides: Partial<WorkRow> = {}): WorkRow {
  return {
    id: WORK_ID,
    owner_id: OWNER,
    domain: "TAKE",
    domain_ref: TAKE_ID,
    status: "WORK_READY",
    retention_expires_at: RETENTION_ISO,
    ...overrides,
  };
}

function art(id: string, key: string): ArtifactRow {
  return {
    id,
    storage_bucket: "audio-artifacts",
    object_key: key,
    deleted_at: null,
  };
}

/** Lexicographic uuid-like ids for stable keyset order in tests. */
function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
}

describe("GO-56 H1 hybrid T00–T17 (mocked)", () => {
  let workStatus: string;
  let artifacts: ArtifactRow[];
  let softDeleteError: { message: string } | null;
  let expireUpdateError: { message: string } | null;
  let forceCasEmpty: boolean;
  let listError: { message: string } | null;
  let countError: { message: string } | null;
  /** GO-58: override final count payload (null = ambiguous API null). */
  let countOverride: number | null | "omit" | undefined;
  let expireUpdateCalls: number;
  let softDeleteCalls: number;
  let listSelectCalls: number;
  let countCalls: number;
  let removeResults: Array<{ error: { message: string } | null }>;
  let removeByKey: Map<string, { error: { message: string } | null }>;
  let artifactEqColumns: string[];
  let orderCalls: Array<{ col: string; ascending: boolean }>;
  let limitCalls: number[];
  let gtCalls: Array<{ col: string; val: string }>;
  let touchedTables: string[];

  function aliveSorted(): ArtifactRow[] {
    return artifacts
      .filter((a) => a.deleted_at == null)
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  function installMocks() {
    fromMock.mockReset();
    storageFromMock.mockReset();
    removeMock.mockReset();

    softDeleteArtifactIfLeaseMock.mockReset();
    softDeleteArtifactIfLeaseMock.mockImplementation(
      async ({ artifactId }: { artifactId: string }) => {
        softDeleteCalls += 1;
        if (softDeleteError) {
          return {
            status: "error" as const,
            errorClass: "UNKNOWN" as const,
            message: softDeleteError.message,
          };
        }
        const row = artifacts.find((a) => a.id === artifactId);
        if (row) row.deleted_at = new Date(NOW_MS).toISOString();
        return {
          status: "ok" as const,
          value: { ok: true, reason: "SOFT_DELETED" as const, artifactId },
        };
      },
    );

    storageFromMock.mockImplementation(() => ({
      remove: (keys: string[]) => {
        const key = keys[0] ?? "";
        removeMock(keys);
        if (removeByKey.has(key)) {
          return Promise.resolve(removeByKey.get(key)!);
        }
        const next = removeResults.shift() ?? { error: null };
        return Promise.resolve(next);
      },
    }));

    fromMock.mockImplementation((table: string) => {
      touchedTables.push(table);

      if (table === "premium_works") {
        const selectChain: Record<string, unknown> = {};
        const self = () => selectChain;
        selectChain.select = vi.fn(self);
        selectChain.eq = vi.fn(self);
        selectChain.maybeSingle = vi.fn(async () => ({
          data: baseWork({
            status: workStatus,
            retention_expires_at: RETENTION_ISO,
          }),
          error: null,
        }));

        const expireBuilder: Record<string, unknown> = {};
        const expireSelf = () => expireBuilder;
        expireBuilder.eq = vi.fn(expireSelf);
        expireBuilder.select = vi.fn(() => {
          expireUpdateCalls += 1;
          return {
            then: (
              onFulfilled?: (v: {
                data: { id: string }[] | null;
                error: { message: string } | null;
              }) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) => {
              const payload =
                expireUpdateError != null
                  ? { data: null, error: expireUpdateError }
                  : forceCasEmpty
                    ? { data: [], error: null }
                    : { data: [{ id: WORK_ID }], error: null };
              return Promise.resolve(payload).then(onFulfilled, onRejected);
            },
          };
        });

        return {
          select: selectChain.select,
          eq: selectChain.eq,
          maybeSingle: selectChain.maybeSingle,
          update: vi.fn((payload: Record<string, unknown>) => {
            expect(payload).toMatchObject({ status: "EXPIRED" });
            expect(payload).not.toHaveProperty("retention_expires_at");
            return expireBuilder;
          }),
        };
      }

      if (table === "audio_artifacts") {
        let mode: "list" | "count" = "list";
        let afterId: string | null = null;
        let pageLimit = 500;

        const chain: Record<string, unknown> = {};
        const self = () => chain;

        chain.select = vi.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head && opts?.count === "exact") {
            mode = "count";
          } else {
            mode = "list";
            listSelectCalls += 1;
          }
          return chain;
        });
        chain.eq = vi.fn((col: string, _val: unknown) => {
          artifactEqColumns.push(col);
          return chain;
        });
        chain.is = vi.fn(self);
        chain.gt = vi.fn((col: string, val: string) => {
          gtCalls.push({ col, val });
          afterId = val;
          return chain;
        });
        chain.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
          orderCalls.push({ col, ascending: opts?.ascending !== false });
          return chain;
        });
        chain.limit = vi.fn((n: number) => {
          limitCalls.push(n);
          pageLimit = n;
          return chain;
        });

        chain.then = (
          resolve: (v: {
            data: unknown;
            error: { message: string } | null;
            count?: number | null;
          }) => unknown,
        ) => {
          if (mode === "count") {
            countCalls += 1;
            if (countError) {
              return Promise.resolve(
                resolve({ data: null, error: countError, count: null }),
              );
            }
            if (countOverride === "omit") {
              return Promise.resolve(
                resolve({ data: null, error: null }),
              );
            }
            if (countOverride !== undefined) {
              return Promise.resolve(
                resolve({
                  data: null,
                  error: null,
                  count: countOverride,
                }),
              );
            }
            return Promise.resolve(
              resolve({
                data: null,
                error: null,
                count: aliveSorted().length,
              }),
            );
          }

          if (listError) {
            return Promise.resolve(resolve({ data: null, error: listError }));
          }
          let rows = aliveSorted();
          if (afterId) {
            rows = rows.filter((r) => r.id > afterId!);
          }
          rows = rows.slice(0, pageLimit);
          // reset per-await filter state for next chain
          afterId = null;
          pageLimit = 500;
          return Promise.resolve(resolve({ data: rows, error: null }));
        };

        return {
          select: chain.select,
          eq: chain.eq,
          is: chain.is,
          gt: chain.gt,
          order: chain.order,
          limit: chain.limit,
          then: chain.then,
          update: vi.fn(() => {
            throw new Error("G3-TCB: direct audio_artifacts update is forbidden");
          }),
        };
      }

      throw new Error(`unexpected table in cleanup: ${table}`);
    });
  }

  beforeEach(() => {
    workStatus = "WORK_READY";
    artifacts = [art(ids(2)[0]!, "k1"), art(ids(2)[1]!, "k2")];
    softDeleteError = null;
    expireUpdateError = null;
    forceCasEmpty = false;
    listError = null;
    countError = null;
    countOverride = undefined;
    expireUpdateCalls = 0;
    markExpiredIfLeaseMock.mockReset();
    markExpiredIfLeaseMock.mockImplementation(async ({ workId }: { workId: string }) => {
      if (typeof forceCasEmpty !== "undefined" && forceCasEmpty) {
        return {
          status: "ok" as const,
          value: { ok: false, reason: "CAS_CONFLICT" as const, workId },
        };
      }
      if (typeof expireUpdateError !== "undefined" && expireUpdateError) {
        return {
          status: "error" as const,
          errorClass: "UNKNOWN" as const,
          message: expireUpdateError.message,
        };
      }
      return {
        status: "ok" as const,
        value: { ok: true, reason: "MARKED_EXPIRED" as const, workId },
      };
    });

    softDeleteCalls = 0;
    listSelectCalls = 0;
    countCalls = 0;
    removeResults = [];
    removeByKey = new Map();
    artifactEqColumns = [];
    orderCalls = [];
    limitCalls = [];
    gtCalls = [];
    touchedTables = [];
    installMocks();
  });

  it("T00 zero artifacts → EXPIRED + finalAlive=0", async () => {
    artifacts = [];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 5 },
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.finalAlive).toBe(0);
    expect(result.pages).toBe(1);
    expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
    expect(countCalls).toBe(1);
  });

  it("T01 one artifact → EXPIRED", async () => {
    artifacts = [art(ids(1)[0]!, "k1")];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 5 },
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.deletedObjectKeys).toEqual(["k1"]);
    expect(result.keysSettled).toBe(1);
    expect(result.finalAlive).toBe(0);
  });

  it("T02 many artifacts single page → EXPIRED", async () => {
    const idList = ids(4);
    artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.pages).toBe(1);
    expect(result.keysSettled).toBe(4);
    expect(result.markedExpired).toBe(true);
  });

  it("T03 multipage keyset (pageSize < K) → ≥2 pages, EXPIRED, ordered", async () => {
    const idList = ids(5);
    artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 2 },
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.pages).toBeGreaterThanOrEqual(3);
    expect(result.keysSettled).toBe(5);
    expect(result.markedExpired).toBe(true);
    expect(orderCalls.every((o) => o.col === "id" && o.ascending)).toBe(true);
    expect(gtCalls.length).toBeGreaterThanOrEqual(1);
    expect(limitCalls.every((n) => n === 2)).toBe(true);
  });

  it("T04 budget exceed → purgeIncomplete, WORK_READY path (no EXPIRED)", async () => {
    const idList = ids(5);
    artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10, maxKeysPerWork: 2 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.budgetHit).toBe(true);
    expect(result.markedExpired).toBe(false);
    expect(result.keysSettled).toBe(2);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    expect(aliveSorted().length).toBe(3);
  });

  it("T05 partial Storage error mid-page → incomplete; failed key alive", async () => {
    const idList = ids(2);
    artifacts = [art(idList[0]!, "k1"), art(idList[1]!, "k2")];
    removeByKey.set("k1", { error: null });
    removeByKey.set("k2", { error: { message: "network error" } });
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.deletedObjectKeys).toEqual(["k1"]);
    expect(result.storageErrors).toEqual(["network error"]);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    expect(aliveSorted().map((a) => a.object_key)).toEqual(["k2"]);
  });

  it("T06 timeout / ambiguous Storage → incomplete, no EXPIRED", async () => {
    removeByKey.set("k1", { error: { message: "Timeout waiting for response" } });
    removeByKey.set("k2", { error: null });
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.deadlineHit).toBe(false);
    expect(result.storageErrors.some((e) => /timeout/i.test(e))).toBe(true);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("T07 wall deadline inject → deadlineHit, incomplete", async () => {
    const idList = ids(3);
    artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
    let ticks = 0;
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10, deadlineMs: 1000 },
      clockMs: () => {
        ticks += 1;
        // After first page fetch + first key, trip deadline.
        return ticks >= 4 ? 1000 : 0;
      },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.deadlineHit).toBe(true);
    expect(result.markedExpired).toBe(false);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("T08 soft-delete error → incomplete, no EXPIRED", async () => {
    softDeleteError = { message: "row update failed" };
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.softDeleteErrors.length).toBeGreaterThan(0);
    expect(result.markedExpired).toBe(false);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("T09 final count/list error → incomplete, never EXPIRED", async () => {
    artifacts = [art(ids(1)[0]!, "k1")];
    countError = { message: "count failed" };
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.listErrors).toContain("count failed");
    expect(result.markedExpired).toBe(false);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("T10 page list error → incomplete", async () => {
    listError = { message: "list failed" };
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.listErrors).toContain("list failed");
    expect(result.markedExpired).toBe(false);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("T11 finalAlive>0 (remainder) blocks EXPIRED", async () => {
    // Settle k1; leave k2 without soft-delete by failing storage on k2,
    // then force count to report remainder (already true via soft-delete skip).
    removeByKey.set("k1", { error: null });
    removeByKey.set("k2", { error: { message: "permission denied" } });
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(aliveSorted().length).toBeGreaterThan(0);
  });

  it("T12 ack-loss then retry → second run EXPIRED (idempotent)", async () => {
    const idList = ids(2);
    artifacts = [art(idList[0]!, "k1"), art(idList[1]!, "k2")];
    removeByKey.set("k1", { error: null });
    removeByKey.set("k2", {
      error: { message: "P27 injected ack-loss after upstream DELETE" },
    });
    const first = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(first.outcome).toBe("purgeIncomplete");
    expect(first.markedExpired).toBe(false);

    // Retry: only k2 remains alive; Storage not-found (already deleted upstream).
    removeByKey.clear();
    removeByKey.set("k2", { error: { message: "Object not found" } });
    expireUpdateCalls = 0;
    const second = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(second.outcome).toBe("purgeComplete");
    expect(second.markedExpired).toBe(true);
    expect(second.finalAlive).toBe(0);
    expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
  });

  it("T13 CAS conflict (0 rows) → incomplete, casConflict", async () => {
    artifacts = [art(ids(1)[0]!, "k1")];
    forceCasEmpty = true;
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.casConflict).toBe(true);
    expect(result.markedExpired).toBe(false);
  });

  it("T14 CAS update error → incomplete, not EXPIRED", async () => {
    artifacts = [art(ids(1)[0]!, "k1")];
    expireUpdateError = { message: "cas update failed" };
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.softDeleteErrors).toContain("cas update failed");
  });

  it("T15 keyset does not advance past unsettled (gt only after full page settle)", async () => {
    const idList = ids(3);
    artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
    removeByKey.set("k1", { error: null });
    removeByKey.set("k2", { error: { message: "network error" } });
    removeByKey.set("k3", { error: null });
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 10 },
    });
    expect(result.outcome).toBe("purgeIncomplete");
    // Single page; failure mid-page → no gt advance for next page.
    expect(gtCalls.length).toBe(0);
    expect(result.markedExpired).toBe(false);
  });

  it("T16 batch continues after purgeIncomplete; dry-run never mutates", async () => {
    __resetPremiumRetentionProcessLockForTests();
    const runCleanupForWork = vi.fn(async ({ workId }: { workId: string }) => {
      if (workId === "w1") {
        return {
          workId,
          markedExpired: false,
          alreadyExpired: false,
          skippedReason: null,
          deletedObjectKeys: [],
          storageErrors: ["x"],
          softDeleteErrors: [],
          listErrors: [],
          outcome: "purgeIncomplete" as const,
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
      return {
        workId,
        markedExpired: true,
        alreadyExpired: false,
        skippedReason: null,
        deletedObjectKeys: ["k"],
        storageErrors: [],
        softDeleteErrors: [],
        listErrors: [],
        outcome: "purgeComplete" as const,
        pages: 1,
        keysAttempted: 1,
        keysSettled: 1,
        budgetHit: false,
        deadlineHit: false,
        finalAlive: 0,
        casConflict: false,
        leaseLost: false,
      };
    });

    const due = [
      {
        id: "w1",
        ownerId: OWNER,
        domain: "TAKE" as const,
        domainRef: TAKE_ID,
        status: "WORK_READY" as const,
        retentionExpiresAtMs: NOW_MS - 1,
      },
      {
        id: "w2",
        ownerId: OWNER,
        domain: "TAKE" as const,
        domainRef: TAKE_ID,
        status: "WORK_READY" as const,
        retentionExpiresAtMs: NOW_MS - 1,
      },
    ];

    const lease = {
      acquire: async () => ({
        status: "ok" as const,
        value: {
          acquired: true,
          reason: "ACQUIRED" as const,
          fencingToken: 1,
          leaseExpiresAt: "t",
          holderRunId: "run",
        },
      }),
      renew: async () => ({
        status: "ok" as const,
        value: {
          renewed: true,
          reason: "RENEWED" as const,
          fencingToken: 1,
          leaseExpiresAt: "t",
          holderRunId: "run",
        },
      }),
      release: async () => ({
        status: "ok" as const,
        value: {
          released: true,
          reason: "RELEASED" as const,
          fencingToken: 1,
        },
      }),
      get: async () => ({
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
      }),
      resolveAmbiguousAcquire: async () => ({
        status: "ok" as const,
        value: {
          acquired: true,
          reason: "ACQUIRED" as const,
          fencingToken: 1,
          leaseExpiresAt: "t",
          holderRunId: "run",
        },
      }),
      resolveAmbiguousRenew: async () => ({
        status: "ok" as const,
        value: {
          renewed: true,
          reason: "RENEWED" as const,
          fencingToken: 1,
          leaseExpiresAt: "t",
          holderRunId: "run",
        },
      }),
      markExpiredIfLease: async ({ workId }: { workId: string }) => ({
        status: "ok" as const,
        value: {
          ok: true,
          reason: "MARKED_EXPIRED" as const,
          workId,
        },
      }),
    };
    const active = await runPremiumRetentionCleanupBatch({
      mode: "active",
      nowMs: NOW_MS,
      // Synthetic test TTL only — OD-62-06 remains HOLD (not production-approved).
      leaseTtlSeconds: 30,
      // GO-72: explicit finite workLimits required on active (PROVISIONAL test values).
      workLimits: {
        pageSize: 50,
        maxKeysPerWork: 25,
        deadlineMs: NOW_MS + 7 * 86_400_000,
      },
      deps: {
        listDueWorks: async () => due,
        runCleanupForWork,
        lease,
      },
    });
    expect(active.purgeIncomplete).toBe(1);
    expect(active.purgeComplete).toBe(1);
    expect(runCleanupForWork).toHaveBeenCalledTimes(2);

    const dry = await runPremiumRetentionCleanupBatch({
      mode: "dry-run",
      nowMs: NOW_MS,
      deps: {
        listDueWorks: async () => due,
        runCleanupForWork,
      },
    });
    expect(dry.works.every((w) => w.outcome === "dryRunWouldExpire")).toBe(true);
    // Still only the two active calls — dry-run must not invoke executor.
    expect(runCleanupForWork).toHaveBeenCalledTimes(2);
    __resetPremiumRetentionProcessLockForTests();
  });

  it("T17 invariant helpers: scope filters; gate; no credits tables; leaseLost always false in H1", async () => {
    artifacts = [art(ids(1)[0]!, "k1")];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
      limits: { pageSize: 5 },
    });
    expect(result.leaseLost).toBe(false);
    expect(artifactEqColumns).toContain("owner_id");
    expect(artifactEqColumns).toContain("take_id");
    expect(artifactEqColumns).not.toContain("mix_session_id");
    expect(
      touchedTables.every((t) => t === "premium_works" || t === "audio_artifacts"),
    ).toBe(true);

    const gate = evaluatePremiumDownloadGate({
      premiumTier: "GOLD",
      quality: "MP3_320",
      hasUnlock: true,
      retentionExpiresAtMs: Date.parse(RETENTION_ISO),
      nowMs: NOW_MS,
      workStatus: "WORK_READY",
    });
    expect(gate).toEqual({ ok: false, reason: "RETENTION_EXPIRED" });
  });

  describe("GO-58 F-1 null/ambiguous alive count fail-closed", () => {
    it("F1-1 explicit count=0 → may EXPIRED when other gates pass", async () => {
      artifacts = [];
      countOverride = 0;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeComplete");
      expect(result.markedExpired).toBe(true);
      expect(result.finalAlive).toBe(0);
      expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
      expect(countCalls).toBe(1);
    });

    it("F1-2 count>0 → purgeIncomplete, no EXPIRED", async () => {
      artifacts = [];
      countOverride = 2;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.markedExpired).toBe(false);
      expect(result.finalAlive).toBe(2);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("F1-3 count=null → purgeIncomplete + AMBIGUOUS_ALIVE_COUNT, no EXPIRED", async () => {
      artifacts = [];
      countOverride = null;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.markedExpired).toBe(false);
      expect(result.finalAlive).toBeNull();
      expect(result.listErrors).toContain("AMBIGUOUS_ALIVE_COUNT");
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("F1-4 count query error → purgeIncomplete, no EXPIRED", async () => {
      artifacts = [];
      countError = { message: "count failed" };
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.markedExpired).toBe(false);
      expect(result.listErrors).toContain("count failed");
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("F1-5 omitted count field → purgeIncomplete, no EXPIRED", async () => {
      artifacts = [];
      countOverride = "omit";
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.markedExpired).toBe(false);
      expect(result.finalAlive).toBeNull();
      expect(result.listErrors).toContain("AMBIGUOUS_ALIVE_COUNT");
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("F1-6 non-integer count → purgeIncomplete, no EXPIRED", async () => {
      artifacts = [];
      countOverride = 1.5;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.markedExpired).toBe(false);
      expect(result.listErrors).toContain("AMBIGUOUS_ALIVE_COUNT");
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("F1-7 CAS conflict after explicit count=0 → no EXPIRED", async () => {
      artifacts = [];
      countOverride = 0;
      forceCasEmpty = true;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.casConflict).toBe(true);
      expect(result.markedExpired).toBe(false);
      expect(result.finalAlive).toBe(0);
    });
  });
});
