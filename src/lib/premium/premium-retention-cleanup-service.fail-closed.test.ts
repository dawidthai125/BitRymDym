/**
 * GO-PREMIUM-20 / GO-56 — Fail-closed Storage remediation unit tests (mocked).
 * All Storage / DB calls are mocked — no live Postgres, no production mutate.
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


import {
  isStorageRemoveIdempotentSuccess,
  runPremiumRetentionCleanupForWork,
} from "@/lib/premium/premium-retention-cleanup-service";

const OWNER = "owner-1";
const WORK_ID = "work-1";
const TAKE_ID = "take-1";
const RETENTION_ISO = "2020-01-01T00:00:00.000Z";
const NOW_MS = Date.parse("2026-10-21T00:00:00.000Z");
const TEST_LEASE_FENCE = {
  runId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  fencingToken: 1,
} as const;


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

type ArtifactRow = {
  id: string;
  storage_bucket: string;
  object_key: string;
  deleted_at: string | null;
};

describe("isStorageRemoveIdempotentSuccess (classifier)", () => {
  it("treats not-found family as success", () => {
    expect(isStorageRemoveIdempotentSuccess("Object not found")).toBe(true);
    expect(isStorageRemoveIdempotentSuccess("does not exist")).toBe(true);
    expect(isStorageRemoveIdempotentSuccess("HTTP 404")).toBe(true);
  });

  it("does not treat timeout / network / permission as success", () => {
    expect(isStorageRemoveIdempotentSuccess("Timeout waiting for response")).toBe(
      false,
    );
    expect(isStorageRemoveIdempotentSuccess("network error")).toBe(false);
    expect(isStorageRemoveIdempotentSuccess("permission denied")).toBe(false);
    expect(isStorageRemoveIdempotentSuccess("Forbidden 403")).toBe(false);
    expect(isStorageRemoveIdempotentSuccess("something weird")).toBe(false);
  });
});

describe("runPremiumRetentionCleanupForWork — fail-closed (mocked)", () => {
  let workStatus: string;
  let retentionExpiresAt: string | null;
  let artifacts: ArtifactRow[];
  let softDeleteError: { message: string } | null;
  let expireUpdateError: { message: string } | null;
  let expireUpdateCalls: number;
  let softDeleteCalls: number;
  let touchedTables: string[];
  let artifactEqColumns: string[];
  let removeResults: Array<{ error: { message: string } | null }>;

  function aliveSorted(): ArtifactRow[] {
    return artifacts
      .filter((a) => a.deleted_at == null)
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  beforeEach(() => {
    workStatus = "WORK_READY";
    retentionExpiresAt = RETENTION_ISO;
    artifacts = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        storage_bucket: "audio-artifacts",
        object_key: "k1",
        deleted_at: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        storage_bucket: "audio-artifacts",
        object_key: "k2",
        deleted_at: null,
      },
    ];
    softDeleteError = null;
    expireUpdateError = null;
    expireUpdateCalls = 0;
    markExpiredIfLeaseMock.mockClear();
    softDeleteCalls = 0;
    touchedTables = [];
    artifactEqColumns = [];
    removeResults = [{ error: null }, { error: null }];

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
      remove: (...args: unknown[]) => {
        const next = removeResults.shift() ?? { error: null };
        removeMock(...args);
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
            retention_expires_at: retentionExpiresAt,
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
        chain.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
          mode = opts?.head && opts?.count === "exact" ? "count" : "list";
          return chain;
        });
        chain.eq = vi.fn((col: string) => {
          artifactEqColumns.push(col);
          return chain;
        });
        chain.is = vi.fn(self);
        chain.gt = vi.fn((_col: string, val: string) => {
          afterId = val;
          return chain;
        });
        chain.order = vi.fn(self);
        chain.limit = vi.fn((n: number) => {
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
            return Promise.resolve(
              resolve({
                data: null,
                error: null,
                count: aliveSorted().length,
              }),
            );
          }
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

      throw new Error(`unexpected table in cleanup: ${table}`);
    });
  });

  it("1 happy path: all keys removed → EXPIRED + purgeComplete", async () => {
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.deletedObjectKeys).toEqual(["k1", "k2"]);
    expect(result.storageErrors).toEqual([]);
    expect(result.softDeleteErrors).toEqual([]);
    expect(result.finalAlive).toBe(0);
    expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
    expect(softDeleteCalls).toBe(2);
    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it("2–3 partial Storage failure: first OK, second error → no EXPIRED", async () => {
    removeResults = [
      { error: null },
      { error: { message: "network error" } },
    ];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.deletedObjectKeys).toEqual(["k1"]);
    expect(result.storageErrors).toEqual(["network error"]);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("4 missing object (not-found) is idempotent success", async () => {
    removeResults = [
      { error: { message: "Object not found" } },
      { error: null },
    ];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.deletedObjectKeys).toEqual(["k1", "k2"]);
    expect(result.storageErrors).toEqual([]);
    expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
  });

  it("5 retry after partial success: second run settles remaining → EXPIRED", async () => {
    removeResults = [
      { error: null },
      { error: { message: "timeout waiting" } },
    ];
    const first = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(first.outcome).toBe("purgeIncomplete");
    expect(first.markedExpired).toBe(false);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();

    removeResults = [{ error: null }];
    softDeleteCalls = 0;
    const second = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(second.outcome).toBe("purgeComplete");
    expect(second.markedExpired).toBe(true);
    expect(second.deletedObjectKeys).toEqual(["k2"]);
    expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
  });

  it("6 timeout / ambiguous → fail-closed, no EXPIRED", async () => {
    removeResults = [
      { error: { message: "Timeout waiting for response" } },
      { error: null },
    ];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.storageErrors.some((e) => /timeout/i.test(e))).toBe(true);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("7 soft-delete error → stop (no further Storage removes), purgeIncomplete, no EXPIRED", async () => {
    softDeleteError = { message: "row update failed" };
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.softDeleteErrors).toEqual(["row update failed"]);
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("8–9 cleanup never touches retention_expires_at, unlocks, or credits tables", async () => {
    await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(
      touchedTables.every((t) => t === "premium_works" || t === "audio_artifacts"),
    ).toBe(true);
    expect(touchedTables).not.toContain("premium_track_unlocks");
    expect(touchedTables).not.toContain("premium_credit_ledger");
    expect(touchedTables).not.toContain("profiles");
  });

  it("10 gate after TTL denies download even while WORK_READY (purge incomplete)", () => {
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

  it("11 resource scope: lists by take_id + owner_id; never mix_session_id", async () => {
    await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(artifactEqColumns).toContain("owner_id");
    expect(artifactEqColumns).toContain("take_id");
    expect(artifactEqColumns).not.toContain("mix_session_id");
  });

  it("12 unexpected Storage message → fail-closed with diagnostic, no secrets", async () => {
    removeResults = [
      { error: { message: "weird storage backend code XYZ-99" } },
      { error: null },
    ];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeIncomplete");
    expect(result.markedExpired).toBe(false);
    expect(result.storageErrors).toEqual(["weird storage backend code XYZ-99"]);
    expect(JSON.stringify(result)).not.toMatch(/service_role|password|secret/i);
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("already EXPIRED → no Storage work", async () => {
    workStatus = "EXPIRED";
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("alreadyExpired");
    expect(result.alreadyExpired).toBe(true);
    expect(result.markedExpired).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
    expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
  });

  it("empty artifact list is listed-scope complete → EXPIRED", async () => {
    artifacts = [];
    const result = await runPremiumRetentionCleanupForWork({ leaseFence: TEST_LEASE_FENCE,
      workId: WORK_ID,
      nowMs: NOW_MS,
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.finalAlive).toBe(0);
    expect(markExpiredIfLeaseMock).toHaveBeenCalledTimes(1);
  });

  describe("G3-TCB / G4-L fencing", () => {
    it("missing leaseFence → no Storage remove, no soft-delete, no EXPIRED", async () => {
      const result = await runPremiumRetentionCleanupForWork({
        workId: WORK_ID,
        nowMs: NOW_MS,
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.leaseLost).toBe(true);
      expect(result.listErrors).toContain("LEASE_FENCE_REQUIRED");
      expect(removeMock).not.toHaveBeenCalled();
      expect(softDeleteArtifactIfLeaseMock).not.toHaveBeenCalled();
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
      expect(touchedTables).not.toContain("audio_artifacts");
    });

    it("invalid fence token (negative) → no effects", async () => {
      const result = await runPremiumRetentionCleanupForWork({
        workId: WORK_ID,
        nowMs: NOW_MS,
        leaseFence: { runId: TEST_LEASE_FENCE.runId, fencingToken: -1 },
      });
      expect(result.listErrors).toContain("LEASE_FENCE_REQUIRED");
      expect(removeMock).not.toHaveBeenCalled();
      expect(softDeleteArtifactIfLeaseMock).not.toHaveBeenCalled();
    });

    it("soft-delete carries the fence identity per artifact", async () => {
      await runPremiumRetentionCleanupForWork({
        leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
      });
      expect(softDeleteArtifactIfLeaseMock).toHaveBeenCalledTimes(2);
      expect(softDeleteArtifactIfLeaseMock).toHaveBeenNthCalledWith(1, {
        workId: WORK_ID,
        artifactId: "00000000-0000-4000-8000-000000000001",
        runId: TEST_LEASE_FENCE.runId,
        fencingToken: TEST_LEASE_FENCE.fencingToken,
      });
    });

    it.each(["STALE_TOKEN", "LEASE_EXPIRED", "LEASE_MISMATCH", "LEASE_MISSING"] as const)(
      "%s on soft-delete → stop at once, leaseLost, no further removes, no EXPIRED",
      async (reason) => {
        softDeleteArtifactIfLeaseMock.mockImplementationOnce(
          async ({ artifactId }: { artifactId: string }) => ({
            status: "ok" as const,
            value: { ok: false, reason, artifactId },
          }),
        );
        const result = await runPremiumRetentionCleanupForWork({
          leaseFence: TEST_LEASE_FENCE,
          workId: WORK_ID,
          nowMs: NOW_MS,
        });
        expect(result.outcome).toBe("purgeIncomplete");
        expect(result.leaseLost).toBe(true);
        expect(result.softDeleteErrors).toEqual([`SOFT_DELETE_${reason}`]);
        expect(removeMock).toHaveBeenCalledTimes(1);
        expect(softDeleteArtifactIfLeaseMock).toHaveBeenCalledTimes(1);
        expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
        expect(artifacts.every((a) => a.deleted_at == null)).toBe(true);
      },
    );

    it("RETENTION_NOT_DUE on soft-delete (unlock renewed) → stop work, no EXPIRED", async () => {
      softDeleteArtifactIfLeaseMock.mockImplementationOnce(
        async ({ artifactId }: { artifactId: string }) => ({
          status: "ok" as const,
          value: { ok: false, reason: "RETENTION_NOT_DUE" as const, artifactId },
        }),
      );
      const result = await runPremiumRetentionCleanupForWork({
        leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.leaseLost).toBe(false);
      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });

    it("ambiguous soft-delete → stop, not settled, no EXPIRED", async () => {
      softDeleteArtifactIfLeaseMock.mockImplementationOnce(async () => ({
        status: "ambiguous" as const,
        operation: "softDeleteArtifactIfLease" as const,
        message: "fetch failed",
      }));
      const result = await runPremiumRetentionCleanupForWork({
        leaseFence: TEST_LEASE_FENCE,
        workId: WORK_ID,
        nowMs: NOW_MS,
      });
      expect(result.outcome).toBe("purgeIncomplete");
      expect(result.softDeleteErrors).toEqual(["SOFT_DELETE_AMBIGUOUS"]);
      expect(result.keysSettled).toBe(0);
      expect(markExpiredIfLeaseMock).not.toHaveBeenCalled();
    });
  });
});
