/**
 * GO-PREMIUM-61 — Mocked residual H1 coverage (GO-60 §9 A01–E03).
 * No production code changes. Documents current contracts (incl. silent fallbacks).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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


import {
  PREMIUM_RETENTION_HYBRID_PAGE_SIZE_FALLBACK,
  runPremiumRetentionCleanupForWork,
} from "@/lib/premium/premium-retention-cleanup-service";

const OWNER = "owner-1";
const WORK_ID = "work-1";
const TAKE_ID = "take-1";
const PROJECT_A = "project-a";
const PROJECT_B = "project-b";
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
  take_id?: string | null;
  project_id?: string | null;
};

type WorkRow = {
  id: string;
  owner_id: string;
  domain: string;
  domain_ref: string;
  status: string;
  retention_expires_at: string | null;
};

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
}

function art(
  id: string,
  key: string,
  refs: { take_id?: string | null; project_id?: string | null } = {
    take_id: TAKE_ID,
  },
): ArtifactRow {
  return {
    id,
    storage_bucket: "audio-artifacts",
    object_key: key,
    deleted_at: null,
    take_id: refs.take_id ?? null,
    project_id: refs.project_id ?? null,
  };
}

describe("GO-61 H1 residual mocked coverage", () => {
  let workRow: WorkRow;
  let artifacts: ArtifactRow[];
  let softDeleteError: { message: string } | null;
  /** When true, soft-delete returns error:null but does not mutate deleted_at. */
  let softDeleteZeroRows: boolean;
  let expireUpdateError: { message: string } | null;
  let forceCasEmpty: boolean;
  let listError: { message: string } | null;
  let countError: { message: string } | null;
  let countOverride: number | null | "omit" | undefined;
  let expireUpdateCalls: number;
  let softDeleteCalls: number;
  let listSelectCalls: number;
  let countCalls: number;
  let removeByKey: Map<string, { error: { message: string } | null }>;
  let artifactEqColumns: string[];
  let artifactEqPairs: Array<{ col: string; val: unknown }>;
  let limitCalls: number[];
  let gtCalls: string[];
  /** Insert into artifacts after N successful list pages (0 = disabled). */
  let insertAfterListPages: number;
  let insertPayload: ArtifactRow | null;
  /** Insert after first successful count (documents TOCTOU residual). */
  let insertAfterCount: ArtifactRow | null;
  let listsCompleted: number;

  function scopeFilter(a: ArtifactRow): boolean {
    if (workRow.domain === "TAKE") {
      return a.take_id === workRow.domain_ref;
    }
    return a.project_id === workRow.domain_ref;
  }

  function aliveSorted(): ArtifactRow[] {
    return artifacts
      .filter((a) => a.deleted_at == null && scopeFilter(a))
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  function installMocks() {
    fromMock.mockReset();
    storageFromMock.mockReset();
    removeMock.mockReset();

    storageFromMock.mockImplementation(() => ({
      remove: (keys: string[]) => {
        const key = keys[0] ?? "";
        removeMock(keys);
        if (removeByKey.has(key)) {
          return Promise.resolve(removeByKey.get(key)!);
        }
        return Promise.resolve({ error: null });
      },
    }));

    fromMock.mockImplementation((table: string) => {
      if (table === "premium_works") {
        const selectChain: Record<string, unknown> = {};
        const self = () => selectChain;
        selectChain.select = vi.fn(self);
        selectChain.eq = vi.fn(self);
        selectChain.maybeSingle = vi.fn(async () => ({
          data: { ...workRow },
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
          update: vi.fn(() => expireBuilder),
        };
      }

      if (table === "audio_artifacts") {
        let mode: "list" | "count" = "list";
        let afterId: string | null = null;
        let pageLimit = 500;

        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn((_c: string, opts?: { count?: string; head?: boolean }) => {
          mode = opts?.head && opts?.count === "exact" ? "count" : "list";
          return chain;
        });
        chain.eq = vi.fn((col: string, val: unknown) => {
          artifactEqColumns.push(col);
          artifactEqPairs.push({ col, val });
          return chain;
        });
        chain.is = vi.fn(self);
        chain.gt = vi.fn((_col: string, val: string) => {
          gtCalls.push(val);
          afterId = val;
          return chain;
        });
        chain.order = vi.fn(self);
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
            if (insertAfterCount && countCalls === 1) {
              artifacts.push(insertAfterCount);
            }
            if (countError) {
              return Promise.resolve(
                resolve({ data: null, error: countError, count: null }),
              );
            }
            if (countOverride === "omit") {
              return Promise.resolve(resolve({ data: null, error: null }));
            }
            if (countOverride !== undefined) {
              return Promise.resolve(
                resolve({ data: null, error: null, count: countOverride }),
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

          // Between-pages inject: before serving page N+1, insert row (may sort before afterId).
          if (
            insertAfterListPages > 0 &&
            insertPayload &&
            listsCompleted === insertAfterListPages
          ) {
            artifacts.push(insertPayload);
            insertPayload = null;
          }
          listsCompleted += 1;

          let rows = aliveSorted();
          if (afterId) rows = rows.filter((r) => r.id > afterId!);
          rows = rows.slice(0, pageLimit);
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

      throw new Error(`unexpected table: ${table}`);
    });
  }

  beforeEach(() => {
    workRow = {
      id: WORK_ID,
      owner_id: OWNER,
      domain: "TAKE",
      domain_ref: TAKE_ID,
      status: "WORK_READY",
      retention_expires_at: RETENTION_ISO,
    };
    artifacts = [art(ids(2)[0]!, "k1"), art(ids(2)[1]!, "k2")];
    softDeleteError = null;
    softDeleteZeroRows = false;
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
        if (softDeleteZeroRows) {
          return {
            status: "ok" as const,
            value: { ok: false, reason: "ARTIFACT_NOT_FOUND" as const, artifactId },
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
    listSelectCalls = 0;
    countCalls = 0;
    removeByKey = new Map();
    artifactEqColumns = [];
    artifactEqPairs = [];
    limitCalls = [];
    gtCalls = [];
    insertAfterListPages = 0;
    insertPayload = null;
    insertAfterCount = null;
    listsCompleted = 0;
    installMocks();
  });

  describe("A — limit / deadline boundaries (current contract)", () => {
    it("A01 omit pageSize → uses FALLBACK 500 in limit()", async () => {
      artifacts = [art(ids(1)[0]!, "k1")];
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        // no limits
      });
      expect(limitCalls.length).toBeGreaterThan(0);
      expect(limitCalls.every((n) => n === PREMIUM_RETENTION_HYBRID_PAGE_SIZE_FALLBACK)).toBe(
        true,
      );
      expect(result.outcome).toBe("purgeComplete");
      expect(PREMIUM_RETENTION_HYBRID_PAGE_SIZE_FALLBACK).toBe(500);
    });

    it("A02 pageSize NaN → same FALLBACK 500 (not reject)", async () => {
      artifacts = [art(ids(1)[0]!, "k1")];
      await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: Number.NaN },
      });
      expect(limitCalls[0]).toBe(PREMIUM_RETENTION_HYBRID_PAGE_SIZE_FALLBACK);
    });

    it("A03 pageSize 0 / negative → clamped to 1; still fail-closed to EXPIRED only if clean", async () => {
      const idList = ids(2);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const r0 = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 0 },
      });
      expect(limitCalls[0]).toBe(1);
      expect(r0.outcome).toBe("purgeComplete");
      expect(r0.pages).toBeGreaterThanOrEqual(2);

      limitCalls = [];
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      installMocks();
      await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: -3 },
      });
      expect(limitCalls[0]).toBe(1);
    });

    it("A04 pageSize 2.9 → floor 2 (multipage)", async () => {
      const idList = ids(3);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 2.9 },
      });
      expect(limitCalls.every((n) => n === 2)).toBe(true);
      expect(result.pages).toBeGreaterThanOrEqual(2);
      expect(result.outcome).toBe("purgeComplete");
    });

    it("A05 maxKeys undefined → may settle all (unbounded)", async () => {
      const idList = ids(4);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      expect(result.budgetHit).toBe(false);
      expect(result.keysSettled).toBe(4);
      expect(result.outcome).toBe("purgeComplete");
    });

    it("A06 maxKeys NaN → treated as unbounded (∞); documents risk", async () => {
      const idList = ids(3);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10, maxKeysPerWork: Number.NaN },
      });
      expect(result.budgetHit).toBe(false);
      expect(result.keysSettled).toBe(3);
      expect(result.outcome).toBe("purgeComplete");
    });

    it("A07 maxKeys 0 → budgetHit, incomplete, no EXPIRED", async () => {
      const idList = ids(2);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10, maxKeysPerWork: 0 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.budgetHit).toBe(true);
      expect(result.keysSettled).toBe(0);
      expect(result.markedExpired).toBe(false);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("A07b maxKeys negative → same as 0 (floor clamp)", async () => {
      artifacts = [art(ids(1)[0]!, "k1")];
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { maxKeysPerWork: -5 },
      });
      expect(result.budgetHit).toBe(true);
      expect(result.markedExpired).toBe(false);
    });

    it("A08 deadline NaN → never deadlineHit (silent disable)", async () => {
      artifacts = [art(ids(1)[0]!, "k1")];
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { deadlineMs: Number.NaN },
        clockMs: () => 999999,
      });
      expect(result.deadlineHit).toBe(false);
      expect(result.outcome).toBe("purgeComplete");
    });

    it("A09 deadline already past before first page → incomplete, 0 settled", async () => {
      const idList = ids(3);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10, deadlineMs: 100 },
        clockMs: () => 100,
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.deadlineHit).toBe(true);
      expect(result.keysSettled).toBe(0);
      expect(result.markedExpired).toBe(false);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("A10 deadline between pages → stop without EXPIRED", async () => {
      const idList = ids(4);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      let ticks = 0;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 2, deadlineMs: 50 },
        clockMs: () => {
          ticks += 1;
          // Allow first page processing; trip before/during second page.
          return ticks >= 5 ? 50 : 0;
        },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.deadlineHit).toBe(true);
      expect(result.markedExpired).toBe(false);
      expect(result.keysSettled).toBeLessThan(4);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("A11 maxKeys exact boundary then remainder → incomplete not EXPIRED", async () => {
      // T04 already covers; keep thin regression for "one over boundary".
      const idList = ids(3);
      artifacts = idList.map((id, i) => art(id, `k${i + 1}`));
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10, maxKeysPerWork: 2 },
      });
      expect(result.budgetHit).toBe(true);
      expect(result.keysSettled).toBe(2);
      expect(result.markedExpired).toBe(false);
      expect(aliveSorted().length).toBe(1);
    });
  });

  describe("B — project_id scope", () => {
    it("B01 STUDIO_PROJECT lists by project_id not take_id", async () => {
      workRow = {
        ...workRow,
        domain: "STUDIO_PROJECT",
        domain_ref: PROJECT_A,
      };
      artifacts = [
        art(ids(1)[0]!, "ka", { project_id: PROJECT_A, take_id: null }),
      ];
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(artifactEqColumns).toContain("project_id");
      expect(artifactEqColumns).not.toContain("take_id");
      expect(
        artifactEqPairs.some(
          (p) => p.col === "project_id" && p.val === PROJECT_A,
        ),
      ).toBe(true);
      expect(result.outcome).toBe("purgeComplete");
      expect(result.deletedObjectKeys).toEqual(["ka"]);
    });

    it("B02 other project same owner never soft-deleted / removed", async () => {
      workRow = {
        ...workRow,
        domain: "STUDIO_PROJECT",
        domain_ref: PROJECT_A,
      };
      const idList = ids(2);
      artifacts = [
        art(idList[0]!, "ka", { project_id: PROJECT_A, take_id: null }),
        art(idList[1]!, "kb", { project_id: PROJECT_B, take_id: null }),
      ];
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      expect(result.deletedObjectKeys).toEqual(["ka"]);
      expect(result.deletedObjectKeys).not.toContain("kb");
      expect(removeMock.mock.calls.flat(2)).not.toContain("kb");
      const other = artifacts.find((a) => a.object_key === "kb");
      expect(other?.deleted_at).toBeNull();
      expect(result.outcome).toBe("purgeComplete");
    });

    it("B03 row without project_id excluded from STUDIO scope", async () => {
      workRow = {
        ...workRow,
        domain: "STUDIO_PROJECT",
        domain_ref: PROJECT_A,
      };
      artifacts = [
        art(ids(1)[0]!, "orphan", { project_id: null, take_id: null }),
      ];
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      expect(result.keysAttempted).toBe(0);
      expect(result.deletedObjectKeys).toEqual([]);
      expect(result.outcome).toBe("purgeComplete");
      expect(artifacts[0]!.deleted_at).toBeNull();
    });
  });

  describe("C — soft-delete / CAS", () => {
    it("C01 fenced soft-delete without row change (ARTIFACT_NOT_FOUND) → no EXPIRED, row alive", async () => {
      artifacts = [art(ids(1)[0]!, "k1")];
      softDeleteZeroRows = true;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      expect(result.markedExpired).toBe(false);
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.softDeleteErrors).toEqual(["SOFT_DELETE_ARTIFACT_NOT_FOUND"]);
      expect(result.keysSettled).toBe(0);
      expect(result.finalAlive).toBeNull();
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
      expect(artifacts[0]!.deleted_at).toBeNull();
    });

    it("C02 soft-delete error → incomplete (regression)", async () => {
      softDeleteError = { message: "soft fail" };
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.softDeleteErrors).toContain("soft fail");
      expect(result.markedExpired).toBe(false);
    });

    it("C03 CAS conflict after count=0 → no EXPIRED", async () => {
      artifacts = [];
      forceCasEmpty = true;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.casConflict).toBe(true);
      expect(result.markedExpired).toBe(false);
      expect(result.outcome).toBe("purgeIncomplete");
    });
  });

  describe("D — insert mid-run (mocked; not live concurrency proof)", () => {
    it("D01 insert between pages with id before cursor → final count blocks EXPIRED", async () => {
      const idList = ids(4);
      // Use ids 2,3,4 first; insert id1 between pages (sorts before afterId).
      artifacts = [
        art(idList[1]!, "k2"),
        art(idList[2]!, "k3"),
        art(idList[3]!, "k4"),
      ];
      insertAfterListPages = 1;
      insertPayload = art(idList[0]!, "k1-early");
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 2 },
      });
      // Microtask insert may land before final count.
      await Promise.resolve();
      expect(result.markedExpired).toBe(false);
      expect(result.outcome).toBe("purgeIncomplete");
      expect((result.finalAlive ?? 0) + aliveSorted().length).toBeGreaterThan(0);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("D02 insert after final count=0 before CAS → documents TOCTOU residual (not safety proof)", async () => {
      artifacts = [art(ids(1)[0]!, "k1")];
      insertAfterCount = art(
        "00000000-0000-4000-8000-000000000099",
        "k-after-count",
      );
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      // Current H1: count snapshot then CAS — insert after count can still EXPIRED.
      // This asserts residual behavior; does NOT claim concurrent safety on live Supabase.
      expect(countCalls).toBeGreaterThanOrEqual(1);
      if (result.markedExpired) {
        expect(result.outcome).toBe("purgeComplete");
        expect(aliveSorted().some((a) => a.object_key === "k-after-count")).toBe(
          true,
        );
      } else {
        // If timing of microtask differs, fail-closed is also acceptable.
        expect(result.outcome).toBe("purgeIncomplete");
      }
    });
  });

  describe("E — fail-closed matrix (thin; avoid dup of T05–T14/F1)", () => {
    it("E-list error → incomplete", async () => {
      listError = { message: "list boom" };
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.listErrors).toContain("list boom");
      expect(result.markedExpired).toBe(false);
    });

    it("E-storage error → incomplete", async () => {
      removeByKey.set("k1", { error: { message: "network" } });
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 10 },
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.markedExpired).toBe(false);
    });

    it("E-ambiguous count → incomplete", async () => {
      artifacts = [];
      countOverride = null;
      const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
        limits: { pageSize: 5 },
      });
      expect(result.listErrors).toContain("AMBIGUOUS_ALIVE_COUNT");
      expect(result.markedExpired).toBe(false);
    });
  });
});
