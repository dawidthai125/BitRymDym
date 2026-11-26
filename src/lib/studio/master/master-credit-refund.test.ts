import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/plans/usage-resets", () => ({ usageWindowStart: vi.fn(async (_u: string, _m: string, d: string) => d) }));
vi.mock("@/lib/studio/quota-credits-read", () => ({ studioQuotaRemaining: vi.fn(async () => 0) }));
vi.mock("@/lib/studio/master/own-content", () => ({ projectHasOwnContent: vi.fn(async () => true) }));
vi.mock("./reference-server", () => ({ referenceGateFor: vi.fn(async () => ({ allowed: true })) }));

const rpc = vi.fn();
const insert = vi.fn();
const from = vi.fn();

/** Chainable query stub: every filter returns itself; terminal reads resolve to the project row. */
function query() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "not", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: { id: P, document_version: 3 }, error: null });
  q.insert = (...a: unknown[]) => {
    insert(...a);
    return Promise.resolve({ error: null });
  };
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ count: 0, data: [], error: null }).then(ok);
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc,
    from: (t: string) => {
      from(t);
      return query();
    },
  }),
}));

import { commitStudioMaster } from "./server";

// 2026-11-26 upload screen: passes in these tests (covered by its own tests).
vi.mock("@/lib/rights/upload-screen", async () => (await import("@/test/upload-screen-mock")).uploadScreenMock());

const O = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const J = "44444444-4444-4444-8444-444444444444";
const R = "33333333-3333-4333-8333-333333333333";
const base = { ownerId: O, projectId: P, tier: "GOLD" as const, jobId: J, target: "streaming", settings: {} };
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

beforeEach(() => {
  rpc.mockReset();
  insert.mockReset();
  from.mockReset();
});

describe("W7 — master claim fails closed without the atomic RPC", () => {
  it("missing RPC (PGRST202 / 42883) → quota_unavailable, nothing inserted, no app-side count", async () => {
    for (const code of ["PGRST202", "42883"]) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: "function not found" } });
      expect(await commitStudioMaster(base)).toEqual({ ok: false, error: "quota_unavailable" });
    }
    expect(insert).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith("studio_master_jobs");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("missing RPC with style or reference also fails closed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect(await commitStudioMaster({ ...base, style: "warm", referenceId: R })).toMatchObject({ ok: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("any other RPC error throws (500), never grants or inserts", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "statement timeout" } });
    await expect(commitStudioMaster(base)).rejects.toThrow("statement timeout");
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(commitStudioMaster(base)).rejects.toThrow("network");
    expect(insert).not.toHaveBeenCalled();
  });

  it("RPC without a row → monthly_limit (fail closed), allowed row → ok with the RPC quota", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await commitStudioMaster(base)).toMatchObject({ ok: false, error: "monthly_limit" });
    rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 20, month_limit: 20, reset_at: "2026-12-01T00:00:00Z" }], error: null });
    expect(await commitStudioMaster(base)).toEqual({ ok: false, error: "monthly_limit", masters: { used: 20, monthLimit: 20, resetAt: "2026-12-01T00:00:00Z" } });
    rpc.mockResolvedValueOnce({ data: [{ allowed: true, used: 21, month_limit: 25, reset_at: "2026-12-01T00:00:00Z" }], error: null });
    expect(await commitStudioMaster(base)).toEqual({ ok: true, jobId: J, masters: { used: 21, monthLimit: 25, resetAt: "2026-12-01T00:00:00Z" } });
    expect(rpc.mock.calls.every((c) => c[0] === "claim_studio_master_job")).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  it("source: no read-then-insert fallback left in commitStudioMaster; 503 mapping", () => {
    const src = read("src/lib/studio/master/server.ts");
    const body = src.slice(src.indexOf("export async function commitStudioMaster"), src.indexOf("export async function approveStudioMaster"));
    expect(body).not.toContain(".insert(");
    expect(body).not.toContain("masterMonthUsage(");
    expect(body).toContain('error: "quota_unavailable"');
    expect(read("src/app/api/studio/projects/[projectId]/master/_shared.ts")).toMatch(/quota_unavailable: 503/);
  });
});

describe("W8 — idempotent pack-credit refund on failed master (migration contract)", () => {
  const sql = read("supabase/migrations/20261121160000_studio_master_credit_refund.sql");
  const fn = (name: string) => {
    const start = sql.indexOf(`function public.${name}(`);
    expect(start, name).toBeGreaterThan(0);
    return sql.slice(start, sql.indexOf("revoke all on function", start));
  };

  it("adds the spent/refunded markers with a consistency check", () => {
    expect(sql).toContain("add column if not exists credit_spent boolean not null default false");
    expect(sql).toContain("add column if not exists credit_refunded_at timestamptz");
    expect(sql).toMatch(/check \(credit_refunded_at is null or \(credit_spent and kind = 'master' and status = 'failed'\)\)/);
  });

  it("refund once: the marker flips from null under the row lock before the credit is added", () => {
    const body = fn("refund_studio_master_credit");
    const update = body.indexOf("update public.studio_master_jobs");
    const credit = body.indexOf("insert into public.studio_quota_credits");
    expect(update).toBeGreaterThan(0);
    expect(credit).toBeGreaterThan(update);
    const guard = body.slice(update, credit);
    expect(guard).toContain("set credit_refunded_at = now()");
    expect(guard).toContain("and credit_refunded_at is null");
    expect(guard).toContain("and credit_spent");
    expect(guard).toContain("and status = 'failed'");
    expect(guard).toContain("and kind = 'master'");
    expect(guard).toContain("returning owner_id into v_owner");
    expect(body).toMatch(/if v_owner is null then\s+return false;/);
    expect(body).toContain("values (v_owner, 'master', 1)");
    expect(body).toContain("least(public.studio_quota_credits.remaining + 1, 100000)");
  });

  it("no refund on success; no double refund on repeated failure callbacks", () => {
    const body = fn("complete_studio_master_job");
    // Only a running job can be completed, so a second failure callback raises NOT_CLAIMED
    // before the refund; the refund itself is also guarded by credit_refunded_at.
    expect(body).toContain("where id = p_job_id and worker_ref = p_worker_ref and status = 'running'");
    const notClaimed = body.indexOf("STUDIO_MASTER_NOT_CLAIMED");
    const refund = body.indexOf("perform public.refund_studio_master_credit(p_job_id)");
    expect(notClaimed).toBeGreaterThan(0);
    expect(refund).toBeGreaterThan(notClaimed);
    expect(body.slice(notClaimed, refund)).toContain("if p_status = 'failed' then");
    expect(body.match(/refund_studio_master_credit/g)?.length).toBe(1);
    // A refund error never blocks finishing the job.
    expect(body).toMatch(/exception when others then\s+raise warning 'STUDIO_MASTER_REFUND_FAILED/);
  });

  it("claim records credit_spent only when a pack credit was really consumed", () => {
    const body = fn("claim_studio_master_job");
    expect(body).toContain("v_credit boolean := false");
    const consume = body.indexOf("consume_studio_quota_credit(p_owner_id, 'master')");
    const mark = body.indexOf("v_credit := true");
    expect(consume).toBeGreaterThan(0);
    expect(mark).toBeGreaterThan(consume);
    expect(body.slice(consume, mark)).toContain("return query select false");
    expect(body).toMatch(/reference_intensity, credit_spent\)/);
    expect(body).toMatch(/coalesce\(p_reference_intensity, 0\) end, v_credit\);/);
    // Same rules as before: advisory lock, admin reset marker, failed/cancelled skipped.
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('studio_master_month:' || p_owner_id::text, 0))");
    expect(body).toContain("public.usage_reset_at(p_owner_id, 'masters')");
    expect(body).toContain("status not in ('failed', 'cancelled')");
  });

  it("all three functions: security definer, service role only", () => {
    for (const name of ["refund_studio_master_credit", "complete_studio_master_job", "claim_studio_master_job"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`));
    }
    expect(fn("refund_studio_master_credit")).toContain("auth.role() is distinct from 'service_role'");
    expect(sql.match(/security definer/g)?.length).toBe(3);
  });

  it("worker keeps calling the same completion RPC (no worker change needed)", () => {
    const worker = read("src/lib/studio/master/worker.ts");
    expect(worker).toContain('admin.rpc("complete_studio_master_job"');
    expect(worker).toContain("p_status: status");
  });
});
