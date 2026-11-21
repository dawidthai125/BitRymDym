import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PAYMENT_PENDING_ORDER_LIMITS, maxProjectsForTier } from "@/config/plan-policy";
import type { AuthContext } from "@/lib/auth/types";
import { createPendingOrder } from "@/lib/payments/checkout-service";
import { SAMPLE_CAP, SAMPLE_MAX_COUNT, effectiveSampleCap } from "@/lib/studio/samples/sample-policy";
import { createStudioSample } from "@/lib/studio/samples/sample-service";
import { encodePcm16Wav, renderInstrumentSample, SAMPLE_RATE } from "@/lib/studio/samples/sample-synth";
import { StudioProjectLimitError } from "@/lib/studio/studio-plan-limits";
import { insertStudioProjectCapped } from "@/lib/studio/studio-project-create";
import { isMissingRpcFunction } from "@/lib/supabase/rpc-errors";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const OWNER = "33333333-3333-4333-8333-333333333333";
const SAMPLE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

/** Minimal admin double: rpc() is mocked, from() records legacy writes, storage records uploads/removes. */
function adminDouble(rpcResult: RpcResult, legacy: { count?: number; row?: Record<string, unknown> } = {}) {
  const calls = {
    rpc: vi.fn(async () => rpcResult),
    inserts: [] as Array<{ table: string; row: unknown }>,
    uploads: [] as string[],
    removes: [] as string[],
  };
  const admin = {
    rpc: calls.rpc,
    from(table: string) {
      let inserted: unknown = null;
      let head = false;
      const api = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          head = head || opts?.head === true;
          return api;
        },
        eq: () => api,
        gte: () => api,
        in: () => api,
        insert(row: unknown) {
          inserted = row;
          calls.inserts.push({ table, row });
          return api;
        },
        single: async () => ({ data: legacy.row ?? inserted, error: null }),
        maybeSingle: async () => ({ data: legacy.row ?? { id: "o1" }, error: null }),
        then(resolve: (v: unknown) => unknown) {
          // Count queries (head) see legacy.count; lab/share follow-up reads resolve empty.
          return Promise.resolve(head ? { data: null, error: null, count: legacy.count ?? 0 } : { data: [], error: null }).then(resolve);
        },
      };
      return api;
    },
    storage: {
      from: () => ({
        upload: async (key: string) => {
          calls.uploads.push(key);
          return { error: null };
        },
        remove: async (keys: string[]) => {
          calls.removes.push(...keys);
          return { error: null };
        },
      }),
    },
  };
  return { admin: admin as never, calls };
}

function auth(): AuthContext {
  return {
    userId: OWNER,
    email: "user@example.com",
    profile: {
      id: OWNER,
      displayName: "User",
      userNumber: 1,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: [],
  };
}

const sampleInput = () => ({
  title: "Fortepian",
  kind: "instrument" as const,
  instrument: "piano",
  rightsAccepted: true,
  bytes: encodePcm16Wav(renderInstrumentSample({ instrument: "piano", midi: 60, durationMs: 1000 }), SAMPLE_RATE),
  declaredContentType: "audio/wav",
  cap: 3,
});

const projectInput = { ownerId: OWNER, tier: "FREE" as const, title: "Nowy projekt", tempoBpm: 120, beatId: null, timelineLengthMs: 240000 };

beforeEach(() => vi.clearAllMocks());

describe("isMissingRpcFunction", () => {
  it("matches only 'function not found' codes", () => {
    expect(isMissingRpcFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcFunction({ code: "42883" })).toBe(true);
    expect(isMissingRpcFunction({ code: "P0001" })).toBe(false);
    expect(isMissingRpcFunction(null)).toBe(false);
  });
});

describe("W4 Studio projects: create_studio_project_capped", () => {
  it("passes the plan cap from plan-policy and returns the inserted row", async () => {
    const { admin, calls } = adminDouble({ data: [{ id: "p1", owner_id: OWNER }], error: null });
    expect(await insertStudioProjectCapped(admin, projectInput)).toMatchObject({ id: "p1" });
    expect(calls.rpc).toHaveBeenCalledWith("create_studio_project_capped", {
      p_owner: OWNER,
      p_max_projects: maxProjectsForTier("FREE"),
      p_title: "Nowy projekt",
      p_tempo_bpm: 120,
      p_beat_id: null,
      p_timeline_length_ms: 240000,
    });
    expect(calls.inserts).toHaveLength(0);
  });

  it("maps PROJECT_LIMIT_REACHED to StudioProjectLimitError (403 path)", async () => {
    const { admin } = adminDouble({ data: null, error: { code: "P0001", message: "PROJECT_LIMIT_REACHED" } });
    await expect(insertStudioProjectCapped(admin, projectInput)).rejects.toBeInstanceOf(StudioProjectLimitError);
  });

  it("other RPC errors and empty results throw (no silent insert)", async () => {
    const failing = adminDouble({ data: null, error: { code: "57014", message: "timeout" } });
    await expect(insertStudioProjectCapped(failing.admin, projectInput)).rejects.toThrow("timeout");
    expect(failing.calls.inserts).toHaveLength(0);
    const empty = adminDouble({ data: [], error: null });
    await expect(insertStudioProjectCapped(empty.admin, projectInput)).rejects.toThrow();
  });

  it("falls back to the plain insert only while the function is missing", async () => {
    const { admin, calls } = adminDouble({ data: null, error: { code: "PGRST202", message: "not found" } }, { row: { id: "legacy" } });
    expect(await insertStudioProjectCapped(admin, projectInput)).toMatchObject({ id: "legacy" });
    expect(calls.inserts[0]).toMatchObject({ table: "studio_projects", row: { owner_id: OWNER, status: "DRAFT" } });
  });

  it("studio-service creates projects only through the capped helper", () => {
    const src = read("src/lib/studio/studio-service.ts");
    const fn = src.slice(src.indexOf("export async function createStudioProjectFor"), src.indexOf("export async function createStudioProject("));
    expect(fn).toContain("insertStudioProjectCapped(admin");
    expect(fn).not.toMatch(/from\("studio_projects"\)\s*\.insert/);
  });
});

describe("W4 user samples: create_studio_sample_capped", () => {
  it("effective cap is bounded by SAMPLE_MAX_COUNT and 0 for invalid caps", () => {
    expect(effectiveSampleCap(3)).toBe(3);
    expect(effectiveSampleCap(10_000)).toBe(SAMPLE_MAX_COUNT);
    expect(effectiveSampleCap(0)).toBe(0);
    expect(effectiveSampleCap(1.5)).toBe(0);
  });

  it("inserts through the RPC with the effective cap", async () => {
    const row = { id: SAMPLE_ID, owner_id: OWNER, title: "Fortepian", kind: "instrument", instrument: "piano", status: "PRIVATE", duration_ms: 1000 };
    const { admin, calls } = adminDouble({ data: [row], error: null }, { count: 0 });
    const result = await createStudioSample(auth(), sampleInput(), admin, SAMPLE_ID);
    expect(result).toMatchObject({ ok: true, sample: { id: SAMPLE_ID, mine: true } });
    expect(calls.rpc).toHaveBeenCalledWith("create_studio_sample_capped", expect.objectContaining({ p_owner: OWNER, p_cap: 3, p_id: SAMPLE_ID, p_lab: null }));
    expect(calls.inserts).toHaveLength(0);
  });

  it("race lost (SAMPLE_CAP_REACHED) → SAMPLE_CAP and the uploaded object is removed", async () => {
    const { admin, calls } = adminDouble({ data: null, error: { code: "P0001", message: "SAMPLE_CAP_REACHED" } }, { count: 2 });
    const result = await createStudioSample(auth(), sampleInput(), admin, SAMPLE_ID);
    expect(result).toMatchObject({ ok: false, error: SAMPLE_CAP });
    expect(calls.removes).toEqual(calls.uploads);
    expect(calls.removes).toHaveLength(1);
  });

  it("pre-check still rejects before upload when the cap is already full", async () => {
    const { admin, calls } = adminDouble({ data: null, error: null }, { count: 3 });
    const result = await createStudioSample(auth(), sampleInput(), admin, SAMPLE_ID);
    expect(result).toMatchObject({ ok: false, error: SAMPLE_CAP });
    expect(calls.uploads).toHaveLength(0);
    expect(calls.rpc).not.toHaveBeenCalled();
  });

  it("falls back to the plain insert while the function is missing", async () => {
    const { admin, calls } = adminDouble({ data: null, error: { code: "PGRST202" } }, { count: 0 });
    const result = await createStudioSample(auth(), sampleInput(), admin, SAMPLE_ID);
    expect(result.ok).toBe(true);
    expect(calls.inserts[0]).toMatchObject({ table: "studio_samples", row: { id: SAMPLE_ID, owner_id: OWNER, status: "PRIVATE" } });
  });
});

describe("W9 payment orders: create_payment_order_capped", () => {
  const order = { user_id: OWNER, session_id: "sess-123456", amount_grosz: 999 };
  const now = new Date("2026-11-21T12:00:00Z");

  it("limits live next to the pack catalog and are sane", () => {
    expect(PAYMENT_PENDING_ORDER_LIMITS.perHour).toBeGreaterThanOrEqual(3);
    expect(PAYMENT_PENDING_ORDER_LIMITS.perDay).toBeGreaterThan(PAYMENT_PENDING_ORDER_LIMITS.perHour);
  });

  it("ok → inserted via the RPC with both caps", async () => {
    const { admin, calls } = adminDouble({ data: [{ status: "ok", order_id: "o1" }], error: null });
    expect(await createPendingOrder(admin, order, now)).toBe("ok");
    expect(calls.rpc).toHaveBeenCalledWith("create_payment_order_capped", {
      p_user: OWNER,
      p_order: order,
      p_max_hour: PAYMENT_PENDING_ORDER_LIMITS.perHour,
      p_max_day: PAYMENT_PENDING_ORDER_LIMITS.perDay,
    });
    expect(calls.inserts).toHaveLength(0);
  });

  it("rate_hour / rate_day → RATE; errors and garbage → PROVIDER (never ok)", async () => {
    for (const status of ["rate_hour", "rate_day"]) {
      const { admin } = adminDouble({ data: [{ status, order_id: null }], error: null });
      expect(await createPendingOrder(admin, order, now)).toBe("RATE");
    }
    expect(await createPendingOrder(adminDouble({ data: null, error: { code: "57014" } }).admin, order, now)).toBe("PROVIDER");
    expect(await createPendingOrder(adminDouble({ data: [], error: null }).admin, order, now)).toBe("PROVIDER");
    expect(await createPendingOrder(adminDouble({ data: [{ status: "ok" }], error: null }).admin, order, now)).toBe("PROVIDER");
  });

  it("missing function → previous hourly count + insert", async () => {
    const full = adminDouble({ data: null, error: { code: "PGRST202" } }, { count: PAYMENT_PENDING_ORDER_LIMITS.perHour });
    expect(await createPendingOrder(full.admin, order, now)).toBe("RATE");
    expect(full.calls.inserts).toHaveLength(0);
    const free = adminDouble({ data: null, error: { code: "42883" } }, { count: 0 });
    expect(await createPendingOrder(free.admin, order, now)).toBe("ok");
    expect(free.calls.inserts[0]).toMatchObject({ table: "payment_orders" });
  });

  it("checkout route answers RATE with HTTP 429 and a Polish message", () => {
    const route = read("src/app/api/payments/p24/checkout/route.ts");
    expect(route).toContain('result.code === "RATE"');
    expect(route).toContain("status: 429");
    expect(route).toContain("Masz za dużo niedokończonych płatności.");
    expect(read("src/lib/payments/checkout-service.ts")).not.toMatch(/from\("payment_orders"\)\.insert\(\{/);
  });
});

describe("migrations 20261121150000 / 20261121150100", () => {
  const studio = read("supabase/migrations/20261121150000_studio_plan_limit_atomic_inserts.sql");
  const pay = read("supabase/migrations/20261121150100_payment_orders_pending_cap.sql");

  it("locked down to service_role, advisory lock, invoker, no hard-coded plan numbers", () => {
    for (const [sql, fns] of [
      [studio, ["create_studio_project_capped", "create_studio_sample_capped"]],
      [pay, ["create_payment_order_capped"]],
    ] as const) {
      for (const fn of fns) {
        expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
        expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
      }
      expect(sql.match(/pg_advisory_xact_lock/g)?.length).toBe(fns.length);
      expect(sql.match(/security invoker set search_path = public/g)?.length).toBe(fns.length);
      expect(sql).not.toMatch(/security definer/i);
    }
    expect(studio).toContain("raise exception 'PROJECT_LIMIT_REACHED'");
    expect(studio).toContain("raise exception 'SAMPLE_CAP_REACHED'");
    expect(studio).toContain("p.status <> 'ARCHIVED'");
    expect(pay).toContain("o.status = 'pending'");
    expect(pay).toContain("interval '24 hours'");
  });
});
