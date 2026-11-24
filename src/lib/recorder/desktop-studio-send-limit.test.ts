/**
 * Windows recorder daily "Wrzuć do Studia" limit (POST/GET/DELETE /api/desktop/studio-send).
 * The route trusts claim_desktop_studio_send for atomicity; here the RPC is an in-memory model
 * of that SQL (per-owner lock → count today → insert), so the route's limit wiring, status codes
 * and plan numbers are checked without a database. The SQL itself: desktop-send-migration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_POLICY } from "@/config/plan-policy";

type Send = { id: string; owner_id: string; created_at: number; used_at: number | null };

const state = vi.hoisted(() => ({
  tier: "FREE" as string,
  loggedIn: true,
  sends: [] as Send[],
  rpcError: null as string | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  deleteFilters: [] as string[],
  seq: 0,
}));

const OWNER = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(async () => (state.loggedIn ? { userId: OWNER, profile: { role: "USER" } } : null)),
}));

vi.mock("@/lib/audio/load-premium-entitlement", () => ({
  resolveProductEntitlementForAuthContext: vi.fn(async () => ({ premiumTier: state.tier })),
}));

vi.mock("@/lib/supabase/admin", () => {
  // Per-owner mutex = pg_advisory_xact_lock('desktop-send:' || owner).
  let lock: Promise<void> = Promise.resolve();
  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = lock;
    let release!: () => void;
    lock = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };
  const dayStart = () => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  return {
    createSupabaseAdminClient: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (state.rpcError) return { data: null, error: { message: state.rpcError } };
        return withLock(async () => {
          const owner = String(args.p_owner_id);
          const max = Number(args.p_max_per_utc_day);
          const used = state.sends.filter((s) => s.owner_id === owner && s.created_at >= dayStart()).length;
          // Yield between the count and the insert: without the lock two calls would both pass.
          await new Promise((r) => setTimeout(r, 5));
          if (args.p_peek || used >= max) {
            return { data: [{ allowed: used < max, send_id: null, used, day_limit: max }], error: null };
          }
          const id = `00000000-0000-4000-8000-${String(++state.seq).padStart(12, "0")}`;
          state.sends.push({ id, owner_id: owner, created_at: Date.now(), used_at: null });
          return { data: [{ allowed: true, send_id: id, used: used + 1, day_limit: max }], error: null };
        });
      },
      from: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          delete: () => chain,
          eq: (col: string, v: unknown) => ((filters[col] = v), state.deleteFilters.push(`eq:${col}`), chain),
          gte: (col: string, v: unknown) => ((filters[`gte:${col}`] = v), state.deleteFilters.push(`gte:${col}`), chain),
          is: (col: string, v: unknown) => ((filters[`is:${col}`] = v), state.deleteFilters.push(`is:${col}`), chain),
          lte: (col: string, v: unknown) => ((filters[`lte:${col}`] = v), chain),
          order: () => chain,
          limit: async () => ({
            data: state.sends
              .filter(
                (s) =>
                  s.owner_id === filters.owner_id &&
                  s.used_at === null &&
                  s.created_at >= Date.parse(String(filters["gte:created_at"])) &&
                  s.created_at <= Date.parse(String(filters["lte:created_at"])),
              )
              .map((s) => ({ id: s.id })),
            error: null,
          }),
          select: () => {
            if (!("id" in filters)) return chain;
            return remove();
          },
        };
        const remove = async () => {
          {
            const since = Date.parse(String(filters["gte:created_at"]));
            const hit = state.sends.filter(
              (s) =>
                s.id === filters.id &&
                s.owner_id === filters.owner_id &&
                s.created_at >= since &&
                ("is:used_at" in filters ? s.used_at === null : true),
            );
            state.sends = state.sends.filter((s) => !hit.includes(s));
            return { data: hit.map((s) => ({ id: s.id })), error: null };
          }
        };
        return chain;
      },
    }),
  };
});

import { DELETE, GET, POST } from "@/app/api/desktop/studio-send/route";

beforeEach(() => {
  state.tier = "FREE";
  state.loggedIn = true;
  state.sends = [];
  state.rpcError = null;
  state.rpcCalls = [];
  state.deleteFilters = [];
});

function preload(n: number) {
  for (let i = 0; i < n; i++) {
    state.sends.push({ id: `pre-${i}`, owner_id: OWNER, created_at: Date.now(), used_at: null });
  }
}

describe("desktop studio-send limit", () => {
  it.each([
    ["FREE", 1],
    ["BRONZE", 2],
    ["SILVER", 3],
    ["GOLD", 5],
  ] as const)("%s: limit comes from PLAN_POLICY recording.sessionsPerDay (%i)", async (tier, n) => {
    state.tier = tier;
    expect(PLAN_POLICY[tier].recording.sessionsPerDay).toBe(n);
    const res = await GET();
    expect(await res.json()).toMatchObject({ allowed: true, used: 0, limit: n, tier });
    expect(state.rpcCalls[0]).toEqual({
      name: "claim_desktop_studio_send",
      args: { p_owner_id: OWNER, p_max_per_utc_day: n, p_peek: true },
    });
  });

  it("under the limit: POST spends one send and returns its id", async () => {
    state.tier = "SILVER";
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, allowed: true, used: 1, limit: 3 });
    expect(body.sendId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.sends).toHaveLength(1);
  });

  it("the last send of the day (limit − 1 used) is still allowed and reaches the limit", async () => {
    state.tier = "BRONZE";
    preload(1);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ allowed: true, used: 2, limit: 2 });
  });

  it("exactly at the limit: POST is 429 desktop_send_limit and nothing is inserted; GET says not allowed", async () => {
    state.tier = "BRONZE";
    preload(2);
    const res = await POST();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ allowed: false, sendId: null, used: 2, limit: 2, error: "desktop_send_limit" });
    expect(state.sends).toHaveLength(2);
    const peek = await GET();
    expect(peek.status).toBe(200);
    expect(await peek.json()).toMatchObject({ allowed: false, used: 2, limit: 2 });
  });

  it("over the limit (e.g. plan downgraded): still 429, counter not increased", async () => {
    state.tier = "FREE";
    preload(3);
    const res = await POST();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ used: 3, limit: 1 });
    expect(state.sends).toHaveLength(3);
  });

  it("two parallel POSTs with one send left: exactly one wins", async () => {
    state.tier = "BRONZE";
    preload(1);
    const [a, b] = await Promise.all([POST(), POST()]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect(state.sends).toHaveLength(2);
  });

  it("five parallel POSTs on Gold from zero: five pass, the rest of a burst is refused", async () => {
    state.tier = "GOLD";
    const res = await Promise.all(Array.from({ length: 7 }, () => POST()));
    expect(res.filter((r) => r.status === 200)).toHaveLength(5);
    expect(res.filter((r) => r.status === 429)).toHaveLength(2);
    expect(state.sends).toHaveLength(5);
  });

  it("not logged in: 401 LOGIN_REQUIRED, no RPC", async () => {
    state.loggedIn = false;
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "LOGIN_REQUIRED" });
    expect(state.rpcCalls).toEqual([]);
  });

  it("RPC error: 500 with a readable Polish message, never 'allowed'", async () => {
    state.rpcError = "boom";
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Nie udało się sprawdzić limitu wysyłek." });
  });

  it("refund gives back an unused send and frees the slot", async () => {
    state.tier = "FREE";
    const sendId = (await (await POST()).json()).sendId as string;
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ sendId }) }));
    expect(await res.json()).toMatchObject({ success: true, refunded: true });
    expect(state.deleteFilters).toEqual(["eq:id", "eq:owner_id", "gte:created_at", "is:used_at"]);
    expect((await POST()).status).toBe(200);
  });

  it("a send already bound to a project (used_at) is not refundable, so the limit stays spent", async () => {
    state.tier = "FREE";
    const sendId = (await (await POST()).json()).sendId as string;
    state.sends[0].used_at = Date.now();
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ sendId }) }));
    expect(await res.json()).toMatchObject({ success: true, refunded: false });
    expect((await POST()).status).toBe(429);
  });

  it("refund is by the exact send id: the other free send of the day stays", async () => {
    state.tier = "BRONZE";
    const first = (await (await POST()).json()).sendId as string;
    const second = (await (await POST()).json()).sendId as string;
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ sendId: first }) }));
    expect(await res.json()).toMatchObject({ refunded: true });
    expect(state.sends.map((s) => s.id)).toEqual([second]);
  });

  it("a claimed send that was never used is handed out again at the limit, once bound it is not", async () => {
    state.tier = "FREE";
    const sendId = (await (await POST()).json()).sendId as string;
    expect((await POST()).status).toBe(429);
    state.sends[0].created_at -= 60_000;
    expect(await (await GET()).json()).toMatchObject({ allowed: true, sendId: null, used: 1, limit: 1 });
    const again = await POST();
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ sendId, used: 1, limit: 1 });
    expect(state.sends).toHaveLength(1);
    state.sends[0].used_at = Date.now();
    expect((await POST()).status).toBe(429);
  });

  it("refund with a bad id is 400", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ sendId: "x" }) }));
    expect(res.status).toBe(400);
  });
});
