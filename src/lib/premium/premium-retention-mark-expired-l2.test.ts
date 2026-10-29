/**
 * GO-PREMIUM-68 / H2-4 — L2 markExpiredIfLease contract + executor wiring (mocked).
 * Does NOT prove PostgreSQL transactional atomicity — live apply is out of H2-4 scope.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());
const storageFromMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/premium-retention-worker-client", () => ({
  createPremiumRetentionWorkerClient: () => ({
    from: fromMock,
    storage: { from: storageFromMock },
  }),
}));

import { runPremiumRetentionCleanupForWork } from "@/lib/premium/premium-retention-cleanup-service";
import {
  PREMIUM_RETENTION_LEASE_RPC,
  createPremiumRetentionLeaseClient,
  type PremiumRetentionLeaseClient,
} from "@/lib/premium/premium-retention-lease";

const OWNER = "owner-1";
const WORK_ID = "work-1";
const TAKE_ID = "take-1";
const NOW_MS = Date.parse("2026-10-22T00:00:00.000Z");
const FENCE = {
  runId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  fencingToken: 7,
} as const;

function emptyArtifactsAdmin() {
  fromMock.mockImplementation((table: string) => {
    if (table === "premium_works") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: WORK_ID,
                owner_id: OWNER,
                domain: "TAKE",
                domain_ref: TAKE_ID,
                status: "WORK_READY",
                retention_expires_at: "2020-01-01T00:00:00.000Z",
              },
              error: null,
            }),
          }),
        }),
        update: () => {
          throw new Error("bare PostgREST EXPIRED update must not run in H2-4");
        },
      };
    }
    if (table === "audio_artifacts") {
      return {
        select: (_c: string, opts?: { head?: boolean }) => {
          if (opts?.head) {
            const terminal = {
              eq: () => terminal,
              is: () => terminal,
              then: (resolve: (v: unknown) => void) =>
                resolve({ count: 0, error: null }),
            };
            return terminal;
          }
          const list = {
            eq: () => list,
            is: () => list,
            gt: () => list,
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          };
          return list;
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function leaseWithMark(
  markExpiredIfLease: PremiumRetentionLeaseClient["markExpiredIfLease"],
): PremiumRetentionLeaseClient {
  return {
    acquire: vi.fn(),
    renew: vi.fn(),
    release: vi.fn(),
    get: vi.fn(),
    resolveAmbiguousAcquire: vi.fn(),
    resolveAmbiguousRenew: vi.fn(),
    markExpiredIfLease,
    softDeleteArtifactIfLease: vi.fn(),
  };
}

describe("GO-PREMIUM-68 H2-4 — migration SQL contract (source only)", () => {
  const sqlPath = path.join(
    process.cwd(),
    "supabase/migrations/20261029130100_premium_retention_mark_expired_if_lease.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");

  it("defines atomic L2 RPC with DEFINER, pinned search_path, restricted EXECUTE (text contract)", () => {
    expect(sql).toMatch(/premium_retention_mark_expired_if_lease/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = pg_catalog, public, pg_temp/);
    expect(sql).not.toMatch(/SET search_path = public\s/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/STALE_TOKEN/);
    expect(sql).toMatch(/MARKED_EXPIRED/);
    expect(sql).toMatch(/ALREADY_EXPIRED/);
    expect(sql).toMatch(/RETENTION_NOT_DUE/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.premium_retention_mark_expired_if_lease\(uuid, uuid, bigint\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.premium_retention_mark_expired_if_lease\(uuid, uuid, bigint\)\s+TO service_role;/,
    );
  });

  it("reads clock_timestamp only after the lease row lock (F5)", () => {
    const leaseLock = sql.search(/WHERE lock_key = 'premium_retention_cleanup'\s+FOR UPDATE;/);
    const clock = sql.indexOf("v_now := clock_timestamp();");
    expect(leaseLock).toBeGreaterThan(0);
    expect(clock).toBeGreaterThan(leaseLock);
    expect(sql).not.toMatch(/v_now timestamptz := clock_timestamp\(\)/);
  });

  it("locks lease before work and CAS status in same function", () => {
    const leaseLock = sql.indexOf(
      "FROM public.premium_retention_scheduler_lease",
    );
    const workLock = sql.indexOf("FROM public.premium_works");
    const update = sql.indexOf("status = 'EXPIRED'");
    expect(leaseLock).toBeGreaterThan(0);
    expect(workLock).toBeGreaterThan(leaseLock);
    expect(update).toBeGreaterThan(workLock);
  });
});

describe("GO-PREMIUM-68 H2-4 — lease client markExpiredIfLease (mocked rpc)", () => {
  it("maps MARKED_EXPIRED", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ ok: true, reason: "MARKED_EXPIRED", work_id: WORK_ID }],
      error: null,
    }));
    const client = createPremiumRetentionLeaseClient({ rpc });
    const ok = await client.markExpiredIfLease({
      workId: WORK_ID,
      runId: FENCE.runId,
      fencingToken: FENCE.fencingToken,
    });
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") {
      expect(ok.value.reason).toBe("MARKED_EXPIRED");
      expect(ok.value.ok).toBe(true);
    }
    expect(rpc).toHaveBeenCalledWith(
      PREMIUM_RETENTION_LEASE_RPC.markExpiredIfLease,
      {
        p_work_id: WORK_ID,
        p_run_id: FENCE.runId,
        p_fencing_token: FENCE.fencingToken,
      },
    );
  });

  it("maps STALE_TOKEN; ambiguous on timeout", async () => {
    const clientOk = createPremiumRetentionLeaseClient({
      rpc: async () => ({
        data: [{ ok: false, reason: "STALE_TOKEN", work_id: WORK_ID }],
        error: null,
      }),
    });
    const stale = await clientOk.markExpiredIfLease({
      workId: WORK_ID,
      runId: FENCE.runId,
      fencingToken: 1,
    });
    expect(stale.status).toBe("ok");
    if (stale.status === "ok") {
      expect(stale.value.ok).toBe(false);
      expect(stale.value.reason).toBe("STALE_TOKEN");
    }

    const clientAmb = createPremiumRetentionLeaseClient({
      rpc: async () => {
        throw new Error("network timeout");
      },
    });
    const amb = await clientAmb.markExpiredIfLease({
      workId: WORK_ID,
      runId: FENCE.runId,
      fencingToken: 1,
    });
    expect(amb.status).toBe("ambiguous");
  });

  it("validates inputs and maps permission errors", async () => {
    const client = createPremiumRetentionLeaseClient({
      rpc: async () => ({
        data: null,
        error: {
          message:
            "Only service_role may call premium_retention_mark_expired_if_lease",
        },
      }),
    });
    const bad = await client.markExpiredIfLease({
      workId: " ",
      runId: FENCE.runId,
      fencingToken: 1,
    });
    expect(bad.status).toBe("error");
    const denied = await client.markExpiredIfLease({
      workId: WORK_ID,
      runId: FENCE.runId,
      fencingToken: 1,
    });
    expect(denied).toMatchObject({
      status: "error",
      errorClass: "PERMISSION",
    });
  });
});

describe("GO-PREMIUM-68 H2-4 — executor uses L2 mark (mocked)", () => {
  beforeEach(() => {
    removeMock.mockResolvedValue({ error: null });
    storageFromMock.mockReturnValue({ remove: removeMock });
    emptyArtifactsAdmin();
  });

  it("1 correct fence → MARKED_EXPIRED / purgeComplete", async () => {
    const mark = vi.fn(async ({ workId }: { workId: string }) => ({
      status: "ok" as const,
      value: {
        ok: true,
        reason: "MARKED_EXPIRED" as const,
        workId,
      },
    }));
    const result = await runPremiumRetentionCleanupForWork({
      workId: WORK_ID,
      nowMs: NOW_MS,
      leaseFence: FENCE,
      lease: leaseWithMark(mark),
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(mark).toHaveBeenCalledWith({
      workId: WORK_ID,
      runId: FENCE.runId,
      fencingToken: FENCE.fencingToken,
    });
  });

  it("2–5 lease rejection reasons → leaseLost", async () => {
    for (const reason of [
      "STALE_TOKEN",
      "LEASE_MISMATCH",
      "LEASE_MISSING",
      "LEASE_EXPIRED",
    ] as const) {
      const mark = vi.fn(async () => ({
        status: "ok" as const,
        value: { ok: false, reason, workId: WORK_ID },
      }));
      const result = await runPremiumRetentionCleanupForWork({
        workId: WORK_ID,
        nowMs: NOW_MS,
        leaseFence: FENCE,
        lease: leaseWithMark(mark),
      });
      expect(result.markedExpired).toBe(false);
      expect(result.leaseLost).toBe(true);
    }
  });

  it("6–9 CAS / status / retention / already expired → not success", async () => {
    for (const reason of [
      "CAS_CONFLICT",
      "NOT_WORK_READY",
      "RETENTION_NOT_DUE",
      "ALREADY_EXPIRED",
    ] as const) {
      const mark = vi.fn(async () => ({
        status: "ok" as const,
        value: { ok: false, reason, workId: WORK_ID },
      }));
      const result = await runPremiumRetentionCleanupForWork({
        workId: WORK_ID,
        nowMs: NOW_MS,
        leaseFence: FENCE,
        lease: leaseWithMark(mark),
      });
      expect(result.markedExpired).toBe(false);
      expect(result.outcome).toBe("purgeIncomplete");
      if (reason === "RETENTION_NOT_DUE") {
        expect(result.casConflict).toBe(false);
      } else {
        expect(result.casConflict).toBe(true);
      }
    }
  });

  it("10 error and 11 ambiguous → fail-closed", async () => {
    const errMark = vi.fn(async () => ({
      status: "error" as const,
      errorClass: "UNKNOWN" as const,
      message: "db boom",
    }));
    const errResult = await runPremiumRetentionCleanupForWork({
      workId: WORK_ID,
      nowMs: NOW_MS,
      leaseFence: FENCE,
      lease: leaseWithMark(errMark),
    });
    expect(errResult.markedExpired).toBe(false);
    expect(errResult.softDeleteErrors.join(" ")).toMatch(/db boom/);

    const ambMark = vi.fn(async () => ({
      status: "ambiguous" as const,
      operation: "markExpiredIfLease" as const,
      message: "timeout",
    }));
    const amb = await runPremiumRetentionCleanupForWork({
      workId: WORK_ID,
      nowMs: NOW_MS,
      leaseFence: FENCE,
      lease: leaseWithMark(ambMark),
    });
    expect(amb.markedExpired).toBe(false);
    expect(amb.listErrors).toContain("MARK_EXPIRED_AMBIGUOUS");
  });

  it("missing leaseFence → LEASE_FENCE_REQUIRED", async () => {
    const mark = vi.fn();
    const result = await runPremiumRetentionCleanupForWork({
      workId: WORK_ID,
      nowMs: NOW_MS,
      lease: leaseWithMark(mark),
    });
    expect(result.leaseLost).toBe(true);
    expect(result.listErrors).toContain("LEASE_FENCE_REQUIRED");
    expect(mark).not.toHaveBeenCalled();
  });
});
