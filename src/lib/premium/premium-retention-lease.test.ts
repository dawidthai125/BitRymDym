/**
 * GO-PREMIUM-65 / H2-1 — unit/mocked lease foundation tests.
 * Semantic model ≠ PostgreSQL concurrency proof.
 * No live Supabase / Storage mutation.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createPremiumRetentionLeaseSemantics,
} from "@/lib/premium/premium-retention-lease.semantics";
import {
  PREMIUM_RETENTION_LEASE_LOCK_KEY,
  PREMIUM_RETENTION_LEASE_OD62_06_PROVISIONAL_HOLD,
  PREMIUM_RETENTION_LEASE_RPC,
  PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS,
  createPremiumRetentionLeaseClient,
  resolveAmbiguousAcquire,
  resolveAmbiguousRenew,
} from "@/lib/premium/premium-retention-lease";

const RUN_A = "11111111-1111-1111-1111-111111111111";
const RUN_B = "22222222-2222-2222-2222-222222222222";
const TTL = PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS;

function semanticsRpc(sem: ReturnType<typeof createPremiumRetentionLeaseSemantics>) {
  return async (fn: string, args?: Record<string, unknown>) => {
    try {
      if (fn === PREMIUM_RETENTION_LEASE_RPC.acquire) {
        const row = sem.acquire(
          String(args?.p_run_id ?? ""),
          Number(args?.p_ttl_seconds),
        );
        return { data: [row], error: null };
      }
      if (fn === PREMIUM_RETENTION_LEASE_RPC.renew) {
        const row = sem.renew(
          String(args?.p_run_id ?? ""),
          Number(args?.p_fencing_token),
          Number(args?.p_ttl_seconds),
        );
        return { data: [row], error: null };
      }
      if (fn === PREMIUM_RETENTION_LEASE_RPC.release) {
        const row = sem.release(
          String(args?.p_run_id ?? ""),
          Number(args?.p_fencing_token),
        );
        return { data: [row], error: null };
      }
      if (fn === PREMIUM_RETENTION_LEASE_RPC.get) {
        return { data: [sem.get()], error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : "rpc failed" },
      };
    }
  };
}

describe("GO-PREMIUM-65 H2-1 — provisional / contract markers", () => {
  it("keeps OD-62-06 provisional hold and test-only TTL marker", () => {
    expect(PREMIUM_RETENTION_LEASE_OD62_06_PROVISIONAL_HOLD).toBe(true);
    expect(PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS).toBe(30);
    expect(PREMIUM_RETENTION_LEASE_LOCK_KEY).toBe("premium_retention_cleanup");
  });
});

describe("GO-PREMIUM-65 H2-1 — migration SQL contract (source artifact)", () => {
  const sqlPath = path.join(
    process.cwd(),
    "supabase/migrations/20261029130000_premium_retention_scheduler_lease.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");

  it("defines singleton seed, DEFINER, pinned search_path, and restricted EXECUTE", () => {
    expect(sql).toMatch(/premium_retention_scheduler_lease/);
    expect(sql).toMatch(/'premium_retention_cleanup'/);
    expect(sql).toMatch(/fencing_token bigint NOT NULL/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = pg_catalog, public, pg_temp/);
    expect(sql).toMatch(
      /Only service_role or premium_retention_worker may call premium_retention_lease_acquire/,
    );
    for (const fn of [
      "premium_retention_lease_acquire\\(uuid, integer\\)",
      "premium_retention_lease_renew\\(uuid, bigint, integer\\)",
      "premium_retention_lease_release\\(uuid, bigint\\)",
      "premium_retention_lease_get\\(\\)",
    ]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\s+FROM PUBLIC, anon, authenticated;`),
      );
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.premium_retention_lease_acquire/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.premium_retention_lease_acquire/);
    expect(sql).toMatch(/TO service_role/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.premium_retention_scheduler_lease/);
  });

  it("implements CAS acquire bump and does not bump on ALREADY_HELD path", () => {
    expect(sql).toMatch(/fencing_token = l\.fencing_token \+ 1/);
    expect(sql).toMatch(/ALREADY_HELD/);
    expect(sql).toMatch(/reason := 'HELD'/);
    expect(sql).not.toMatch(/SELECT[\s\S]*FROM public\.premium_retention_scheduler_lease[\s\S]*UPDATE[\s\S]*FROM app/i);
  });

  it("does not include L2 EXPIRED mark RPC (H2-4)", () => {
    expect(sql).not.toMatch(/mark_expired/i);
    expect(sql).not.toMatch(/premium_retention_mark_expired/);
  });
});

describe("GO-PREMIUM-65 H2-1 — semantic model (not PG atomicity proof)", () => {
  it("acquire success on free lease bumps fencing token", () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 1_000_000 });
    const row = sem.acquire(RUN_A, TTL);
    expect(row.acquired).toBe(true);
    expect(row.reason).toBe("ACQUIRED");
    expect(row.fencing_token).toBe(1);
    expect(row.holder_run_id).toBe(RUN_A);
  });

  it("second acquire while held conflicts", () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 1_000_000 });
    const { first, second } = sem.tryConcurrentAcquire(
      { runId: RUN_A, ttlSeconds: TTL },
      { runId: RUN_B, ttlSeconds: TTL },
    );
    expect(first.acquired).toBe(true);
    expect(first.fencing_token).toBe(1);
    expect(second.acquired).toBe(false);
    expect(second.reason).toBe("HELD");
    expect(second.fencing_token).toBeNull();
  });

  it("steal after expiry increments fencing token", () => {
    let now = 1_000_000;
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => now });
    const a = sem.acquire(RUN_A, 10);
    expect(a.fencing_token).toBe(1);
    now = 1_000_000 + 11_000;
    const b = sem.acquire(RUN_B, TTL);
    expect(b.acquired).toBe(true);
    expect(b.reason).toBe("ACQUIRED");
    expect(b.fencing_token).toBe(2);
    expect(b.holder_run_id).toBe(RUN_B);
  });

  it("idempotent acquire same run_id does not bump token", () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 1_000_000 });
    const first = sem.acquire(RUN_A, TTL);
    const second = sem.acquire(RUN_A, TTL);
    expect(first.fencing_token).toBe(1);
    expect(second.reason).toBe("ALREADY_HELD");
    expect(second.fencing_token).toBe(1);
  });

  it("renew with current token succeeds; stale token rejected", () => {
    let now = 1_000_000;
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => now });
    const a = sem.acquire(RUN_A, TTL);
    const ok = sem.renew(RUN_A, a.fencing_token!, TTL);
    expect(ok.renewed).toBe(true);
    expect(ok.reason).toBe("RENEWED");

    now = 1_000_000 + 40_000;
    const stolen = sem.acquire(RUN_B, TTL);
    expect(stolen.fencing_token).toBe(2);
    const stale = sem.renew(RUN_A, a.fencing_token!, TTL);
    expect(stale.renewed).toBe(false);
    expect(stale.reason).toBe("LEASE_LOST");
  });

  it("release with current token frees; stale release does not free new holder", () => {
    const now = 1_000_000;
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => now });
    const a = sem.acquire(RUN_A, TTL);
    const released = sem.release(RUN_A, a.fencing_token!);
    expect(released.released).toBe(true);
    expect(sem.get().holder_run_id).toBeNull();

    const b = sem.acquire(RUN_B, TTL);
    expect(b.fencing_token).toBe(2);
    const staleRelease = sem.release(RUN_A, a.fencing_token!);
    expect(staleRelease.released).toBe(false);
    expect(staleRelease.reason).toBe("NOT_HOLDER");
    expect(sem.get().holder_run_id).toBe(RUN_B);
    expect(sem.get().fencing_token).toBe(2);
  });

  it("permission deny surfaces service_role contract error", () => {
    const sem = createPremiumRetentionLeaseSemantics({ denyAll: true });
    expect(() => sem.acquire(RUN_A, TTL)).toThrow(/Only service_role/);
  });
});

describe("GO-PREMIUM-65 H2-1 — client RPC wrapper (mocked)", () => {
  it("maps successful acquire/renew/release via rpc deps", async () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 5_000_000 });
    const client = createPremiumRetentionLeaseClient({ rpc: semanticsRpc(sem) });

    const acquired = await client.acquire({ runId: RUN_A, ttlSeconds: TTL });
    expect(acquired.status).toBe("ok");
    if (acquired.status !== "ok") return;
    expect(acquired.value.acquired).toBe(true);
    expect(acquired.value.fencingToken).toBe(1);

    const renewed = await client.renew({
      runId: RUN_A,
      fencingToken: 1,
      ttlSeconds: TTL,
    });
    expect(renewed.status).toBe("ok");
    if (renewed.status !== "ok") return;
    expect(renewed.value.renewed).toBe(true);

    const released = await client.release({ runId: RUN_A, fencingToken: 1 });
    expect(released.status).toBe("ok");
    if (released.status !== "ok") return;
    expect(released.value.released).toBe(true);
  });

  it("validates input before rpc", async () => {
    const sem = createPremiumRetentionLeaseSemantics();
    const client = createPremiumRetentionLeaseClient({ rpc: semanticsRpc(sem) });

    const badRun = await client.acquire({ runId: "  ", ttlSeconds: TTL });
    expect(badRun).toEqual({
      status: "error",
      errorClass: "VALIDATION",
      message: "run_id required",
    });

    const badTtl = await client.acquire({ runId: RUN_A, ttlSeconds: 0 });
    expect(badTtl.status).toBe("error");
    if (badTtl.status === "error") {
      expect(badTtl.errorClass).toBe("VALIDATION");
    }

    const badToken = await client.renew({
      runId: RUN_A,
      fencingToken: -1,
      ttlSeconds: TTL,
    });
    expect(badToken.status).toBe("error");
  });

  it("maps permission rpc errors", async () => {
    const client = createPremiumRetentionLeaseClient({
      rpc: async () => ({
        data: null,
        error: { message: "Only service_role may call premium_retention_lease_acquire" },
      }),
    });
    const result = await client.acquire({ runId: RUN_A, ttlSeconds: TTL });
    expect(result).toEqual({
      status: "error",
      errorClass: "PERMISSION",
      message: "Only service_role may call premium_retention_lease_acquire",
    });
  });

  it("marks transport timeout as ambiguous (not confirmed success)", async () => {
    const client = createPremiumRetentionLeaseClient({
      rpc: async () => {
        throw new Error("fetch failed: network timeout");
      },
    });
    const result = await client.acquire({ runId: RUN_A, ttlSeconds: TTL });
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.operation).toBe("acquire");
    }
  });
});

describe("GO-PREMIUM-65 H2-1 — ambiguous outcome resolution", () => {
  it("resolveAmbiguousAcquire: probe shows we hold → ALREADY_HELD without re-bump", async () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 9_000_000 });
    sem.acquire(RUN_A, TTL);
    const before = sem.snapshot().fencingToken;

    const client = createPremiumRetentionLeaseClient({ rpc: semanticsRpc(sem) });
    const resolved = await resolveAmbiguousAcquire({
      runId: RUN_A,
      ttlSeconds: TTL,
      get: () => client.get(),
      acquire: (args) => client.acquire(args),
    });

    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.value.reason).toBe("ALREADY_HELD");
    expect(resolved.value.fencingToken).toBe(before);
    expect(sem.snapshot().fencingToken).toBe(before);
  });

  it("resolveAmbiguousAcquire: not holder → safe re-acquire attempt", async () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 9_000_000 });
    // free lease
    const client = createPremiumRetentionLeaseClient({ rpc: semanticsRpc(sem) });
    const resolved = await client.resolveAmbiguousAcquire({
      runId: RUN_A,
      ttlSeconds: TTL,
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.value.acquired).toBe(true);
    expect(resolved.value.fencingToken).toBe(1);
  });

  it("resolveAmbiguousRenew: lost after steal → LEASE_LOST", async () => {
    let now = 1_000_000;
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => now });
    const a = sem.acquire(RUN_A, 5);
    now = 1_000_000 + 6_000;
    sem.acquire(RUN_B, TTL);

    const client = createPremiumRetentionLeaseClient({ rpc: semanticsRpc(sem) });
    const resolved = await resolveAmbiguousRenew({
      runId: RUN_A,
      fencingToken: a.fencing_token!,
      get: () => client.get(),
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.value.renewed).toBe(false);
    expect(resolved.value.reason).toBe("LEASE_LOST");
  });

  it("client renew ambiguous path uses resolveAmbiguousRenew", async () => {
    const sem = createPremiumRetentionLeaseSemantics({ nowMs: () => 2_000_000 });
    const acquired = sem.acquire(RUN_A, TTL);
    const client = createPremiumRetentionLeaseClient({ rpc: semanticsRpc(sem) });

    const rpc = vi.fn(async (fn: string) => {
      if (fn === PREMIUM_RETENTION_LEASE_RPC.get) {
        return { data: [sem.get()], error: null };
      }
      throw new Error("timed out");
    });
    const flaky = createPremiumRetentionLeaseClient({ rpc });
    const ambiguous = await flaky.renew({
      runId: RUN_A,
      fencingToken: acquired.fencing_token!,
      ttlSeconds: TTL,
    });
    expect(ambiguous.status).toBe("ambiguous");

    const resolved = await client.resolveAmbiguousRenew({
      runId: RUN_A,
      fencingToken: acquired.fencing_token!,
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.value.renewed).toBe(true);
  });
});

describe("GO-PREMIUM-65 H2-1 — out-of-scope guards", () => {
  it("does not export scheduler wiring hooks from lease module surface", async () => {
    const mod = await import("@/lib/premium/premium-retention-lease");
    expect(mod).not.toHaveProperty("runPremiumRetentionCleanupBatch");
    expect(mod).not.toHaveProperty("runPremiumRetentionCleanupForWork");
  });
});
