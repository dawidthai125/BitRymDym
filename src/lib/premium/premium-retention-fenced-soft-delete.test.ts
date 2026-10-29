/**
 * G3-TCB / G4-L — worker credential, fenced soft-delete client, migration text contract.
 * Mocked / source-text only. Does NOT prove catalog privileges, RLS, locking or
 * transactional atomicity — those require a real Postgres (PREMIUM_RETENTION_FENCING_CONTRACT.md §7).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createPremiumRetentionLeaseClient,
  isValidPremiumRetentionLeaseFence,
  PREMIUM_RETENTION_LEASE_RPC,
} from "@/lib/premium/premium-retention-lease";
import {
  PREMIUM_RETENTION_WORKER_ROLE,
  PremiumRetentionWorkerCredentialError,
  resolvePremiumRetentionWorkerTransport,
} from "@/lib/supabase/premium-retention-worker-client";

const WORK_ID = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "22222222-2222-4222-8222-222222222222";
const FENCE = { runId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", fencingToken: 3 } as const;

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

function readMigration(name: string): string {
  return readFileSync(path.join(process.cwd(), "supabase/migrations", name), "utf8");
}

describe("premium retention worker credential (fail-closed)", () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  };

  it("missing JWT → MISSING", () => {
    expect(() => resolvePremiumRetentionWorkerTransport(base)).toThrow(
      "PREMIUM_RETENTION_WORKER_CREDENTIAL_MISSING",
    );
  });

  it("service-role key reused as worker JWT → rejected", () => {
    expect(() =>
      resolvePremiumRetentionWorkerTransport({
        ...base,
        PREMIUM_RETENTION_WORKER_JWT: "service-key",
      }),
    ).toThrow("PREMIUM_RETENTION_WORKER_CREDENTIAL_IS_SERVICE_ROLE");
  });

  it("secret API keys (sb_secret_ / service_role JWT as apikey) → rejected", () => {
    const jwt = fakeJwt({ role: PREMIUM_RETENTION_WORKER_ROLE });
    for (const apiKey of ["sb_secret_abc", fakeJwt({ role: "service_role" })]) {
      expect(() =>
        resolvePremiumRetentionWorkerTransport({
          NEXT_PUBLIC_SUPABASE_URL: base.NEXT_PUBLIC_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: apiKey,
          PREMIUM_RETENTION_WORKER_JWT: jwt,
        }),
      ).toThrow("PREMIUM_RETENTION_WORKER_CREDENTIAL_IS_SERVICE_ROLE");
    }
  });

  it("JWT with another role (service_role) → WRONG_ROLE", () => {
    expect(() =>
      resolvePremiumRetentionWorkerTransport({
        ...base,
        PREMIUM_RETENTION_WORKER_JWT: fakeJwt({ role: "service_role" }),
      }),
    ).toThrow(PremiumRetentionWorkerCredentialError);
  });

  it("malformed JWT → WRONG_ROLE", () => {
    expect(() =>
      resolvePremiumRetentionWorkerTransport({
        ...base,
        PREMIUM_RETENTION_WORKER_JWT: "not-a-jwt",
      }),
    ).toThrow("PREMIUM_RETENTION_WORKER_CREDENTIAL_WRONG_ROLE");
  });

  it("worker-role JWT → anon apikey + worker bearer", () => {
    const jwt = fakeJwt({ role: PREMIUM_RETENTION_WORKER_ROLE });
    const t = resolvePremiumRetentionWorkerTransport({
      ...base,
      PREMIUM_RETENTION_WORKER_JWT: jwt,
    });
    expect(t).toEqual({ url: base.NEXT_PUBLIC_SUPABASE_URL, apiKey: "anon-key", jwt });
  });
});

describe("isValidPremiumRetentionLeaseFence", () => {
  it("accepts runId + non-negative integer token only", () => {
    expect(isValidPremiumRetentionLeaseFence(FENCE)).toBe(true);
    expect(isValidPremiumRetentionLeaseFence(undefined)).toBe(false);
    expect(isValidPremiumRetentionLeaseFence({ runId: " ", fencingToken: 1 })).toBe(false);
    expect(isValidPremiumRetentionLeaseFence({ runId: "r", fencingToken: -1 })).toBe(false);
    expect(isValidPremiumRetentionLeaseFence({ runId: "r", fencingToken: 1.5 })).toBe(false);
  });
});

describe("lease client softDeleteArtifactIfLease (mocked rpc)", () => {
  const input = { workId: WORK_ID, artifactId: ARTIFACT_ID, ...FENCE };

  it("calls fenced RPC with work, artifact, run and token", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ ok: true, reason: "SOFT_DELETED", artifact_id: ARTIFACT_ID }],
      error: null,
    }));
    const res = await createPremiumRetentionLeaseClient({ rpc }).softDeleteArtifactIfLease(
      input,
    );
    expect(res).toEqual({
      status: "ok",
      value: { ok: true, reason: "SOFT_DELETED", artifactId: ARTIFACT_ID },
    });
    expect(rpc).toHaveBeenCalledWith(PREMIUM_RETENTION_LEASE_RPC.softDeleteArtifactIfLease, {
      p_work_id: WORK_ID,
      p_artifact_id: ARTIFACT_ID,
      p_run_id: FENCE.runId,
      p_fencing_token: FENCE.fencingToken,
    });
  });

  it.each([
    ["ALREADY_DELETED", true],
    ["STALE_TOKEN", false],
    ["LEASE_EXPIRED", false],
    ["RETENTION_NOT_DUE", false],
    ["ARTIFACT_NOT_LINKED", false],
  ] as const)("maps %s (ok=%s)", async (reason, ok) => {
    const client = createPremiumRetentionLeaseClient({
      rpc: async () => ({ data: [{ ok, reason, artifact_id: ARTIFACT_ID }], error: null }),
    });
    const res = await client.softDeleteArtifactIfLease(input);
    expect(res).toMatchObject({ status: "ok", value: { ok, reason } });
  });

  it("inconsistent ok/reason or unknown reason → INVALID_RESPONSE", async () => {
    for (const row of [
      { ok: true, reason: "STALE_TOKEN" },
      { ok: false, reason: "SOFT_DELETED" },
      { ok: true, reason: "WHATEVER" },
    ]) {
      const client = createPremiumRetentionLeaseClient({
        rpc: async () => ({ data: [row], error: null }),
      });
      expect(await client.softDeleteArtifactIfLease(input)).toMatchObject({
        status: "error",
        errorClass: "INVALID_RESPONSE",
      });
    }
  });

  it("timeout → ambiguous; permission → PERMISSION; empty artifactId → VALIDATION", async () => {
    const amb = createPremiumRetentionLeaseClient({
      rpc: async () => {
        throw new Error("fetch failed");
      },
    });
    expect(await amb.softDeleteArtifactIfLease(input)).toMatchObject({
      status: "ambiguous",
      operation: "softDeleteArtifactIfLease",
    });

    const denied = createPremiumRetentionLeaseClient({
      rpc: async () => ({ data: null, error: { message: "permission denied for function" } }),
    });
    expect(await denied.softDeleteArtifactIfLease(input)).toMatchObject({
      status: "error",
      errorClass: "PERMISSION",
    });

    const rpc = vi.fn();
    const bad = createPremiumRetentionLeaseClient({ rpc });
    expect(
      await bad.softDeleteArtifactIfLease({ ...input, artifactId: " " }),
    ).toMatchObject({ status: "error", errorClass: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("migration text contract (source only — not catalog proof)", () => {
  const roleSql = readMigration(
    "20261029130200_premium_retention_worker_role_fenced_soft_delete.sql",
  );
  const leaseSql = readMigration("20261029130000_premium_retention_scheduler_lease.sql");
  const l2Sql = readMigration("20261029130100_premium_retention_mark_expired_if_lease.sql");

  it("worker role is NOLOGIN, NOBYPASSRLS, reachable only via authenticator", () => {
    expect(roleSql).toMatch(/CREATE ROLE premium_retention_worker[\s\S]*?NOLOGIN[\s\S]*?NOBYPASSRLS/);
    expect(roleSql).toMatch(/GRANT premium_retention_worker TO authenticator;/);
  });

  it("worker gets no DML on public tables (only SELECT / EXECUTE / USAGE)", () => {
    const grants = roleSql.match(/GRANT [^;]+ TO [^;]*premium_retention_worker[^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      if (/ON TABLE storage\.objects/.test(g)) continue;
      expect(g).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/);
    }
  });

  it("service_role loses DML on premium_works, premium_unlock_events and the lease table", () => {
    for (const table of ["premium_works", "premium_unlock_events"]) {
      expect(roleSql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM service_role;`));
      expect(roleSql).toMatch(new RegExp(`GRANT SELECT ON TABLE public\\.${table} TO service_role;`));
    }
    expect(roleSql).toMatch(/REVOKE TRUNCATE ON TABLE public\.audio_artifacts FROM service_role, anon, authenticated;/);
    for (const fn of [
      "premium_retention_lease_acquire", "premium_retention_lease_renew", "premium_retention_lease_release",
      "premium_retention_mark_expired_if_lease",
    ]) {
      expect(roleSql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM service_role;`));
    }
    expect(leaseSql).toMatch(
      /REVOKE ALL ON TABLE public\.premium_retention_scheduler_lease\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(leaseSql).toMatch(/GRANT SELECT ON TABLE public\.premium_retention_scheduler_lease TO service_role;/);
    expect(leaseSql).not.toMatch(/GRANT ALL ON TABLE public\.premium_retention_scheduler_lease/);
  });

  it("fenced soft-delete locks lease → work → artifact, reads clock after lease lock, then updates", () => {
    const fn = roleSql.slice(
      roleSql.indexOf("FUNCTION public.premium_retention_soft_delete_artifact_if_lease("),
    );
    const lease = fn.search(/FROM public\.premium_retention_scheduler_lease\s+WHERE lock_key = 'premium_retention_cleanup'\s+FOR UPDATE;/);
    const clock = fn.indexOf("v_now := clock_timestamp();");
    const work = fn.search(/FROM public\.premium_works\s+WHERE id = p_work_id\s+FOR UPDATE;/);
    const artifact = fn.search(/FROM public\.audio_artifacts\s+WHERE id = p_artifact_id\s+FOR UPDATE;/);
    const guc = fn.indexOf("set_config('brd.premium_retention_fenced_artifact'");
    const update = fn.indexOf("UPDATE public.audio_artifacts");
    expect(lease).toBeGreaterThan(0);
    expect(clock).toBeGreaterThan(lease);
    expect(work).toBeGreaterThan(clock);
    expect(artifact).toBeGreaterThan(work);
    expect(guc).toBeGreaterThan(artifact);
    expect(update).toBeGreaterThan(guc);
    for (const reason of ["LEASE_EXPIRED", "LEASE_MISMATCH", "STALE_TOKEN", "RETENTION_NOT_DUE", "ARTIFACT_NOT_LINKED"]) {
      expect(fn).toContain(`'${reason}'`);
    }
  });

  it("linkage rule never yields NULL (NULL take_id / project_id = not linked)", () => {
    const fn = roleSql.slice(roleSql.indexOf("FUNCTION public.premium_retention_links("));
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(/SELECT COALESCE\([\s\S]*,\s+false\s+\);/);
  });

  it("fenced GUC is reset right after the guarded UPDATE", () => {
    const fn = roleSql.slice(
      roleSql.indexOf("FUNCTION public.premium_retention_soft_delete_artifact_if_lease("),
    );
    const update = fn.indexOf("UPDATE public.audio_artifacts");
    const reset = fn.indexOf("set_config('brd.premium_retention_fenced_artifact', '', true)");
    expect(reset).toBeGreaterThan(update);
    expect(fn.slice(update, reset)).not.toMatch(/\bRETURN\b(?!ING)/);
  });

  it("role attributes are enforced even when the role already exists", () => {
    expect(roleSql).toMatch(/ALTER ROLE premium_retention_worker NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT;/);
    expect(roleSql).toMatch(/rolsuper OR rolreplication OR rolbypassrls/);
  });

  it("trigger rejects unfenced soft-delete and relinking of premium-linked artifacts", () => {
    expect(roleSql).toMatch(/premium-linked audio_artifacts soft-delete requires premium_retention_soft_delete_artifact_if_lease/);
    expect(roleSql).toMatch(/premium-linked audio_artifacts linkage is immutable/);
    expect(roleSql).toMatch(/premium-linked audio_artifacts storage location is immutable/);
    expect(roleSql).toMatch(/premium-linked audio_artifacts soft-delete is irreversible/);
  });

  it("acquire and renew read clock only after the lease row lock (F5)", () => {
    expect(leaseSql).not.toMatch(/v_now timestamptz := clock_timestamp\(\);\s+v_row public\.premium_retention_scheduler_lease%ROWTYPE;\s+v_updated/);
    const renew = leaseSql.slice(leaseSql.indexOf("FUNCTION public.premium_retention_lease_renew("));
    expect(renew.search(/FOR UPDATE;\s+v_now := clock_timestamp\(\);/)).toBeGreaterThan(0);
    expect(l2Sql.search(/FOR UPDATE;[\s\S]*?v_now := clock_timestamp\(\);/)).toBeGreaterThan(0);
  });

  it("every SECURITY DEFINER function pins search_path with pg_temp last", () => {
    for (const sql of [roleSql, leaseSql, l2Sql]) {
      const definers = sql.match(/^SECURITY DEFINER\s+SET search_path = [^\n]+/gm) ?? [];
      expect(definers.length).toBeGreaterThan(0);
      expect(definers.length).toBe((sql.match(/^SECURITY DEFINER\s*$/gm) ?? []).length);
      for (const d of definers) {
        expect(d).toMatch(/SET search_path = pg_catalog, public, pg_temp/);
      }
    }
  });

  it("every new function revokes EXECUTE from PUBLIC, anon, authenticated", () => {
    const fns = [...roleSql.matchAll(/CREATE OR REPLACE FUNCTION (public\.\w+)\(/g)].map((m) => m[1]!);
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      expect(roleSql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${fn.replace(".", "\\.")}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated(, service_role)?;`),
      );
    }
  });
});
