import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPlanSnapshot = vi.hoisted(() => vi.fn());
const loadAddonSnapshot = vi.hoisted(() => vi.fn());
const registerPayuOrder = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments/snapshots", () => ({ loadPlanSnapshot, loadAddonSnapshot }));
vi.mock("@/lib/payments/payu-client", () => ({ registerPayuOrder }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const { STARTER_PACK_OFFER, starterPackGrosz, youtubeUnitsForGrosz, YOUTUBE_PACK_OFFERS } = await import("@/config/plan-policy");
const { checkoutPrice, priceGrosz } = await import("@/lib/payments/money");
const { loadStarterOffer, starterOfferWindow } = await import("@/lib/payments/starter-offer");
const { createPendingOrder, startCheckout } = await import("@/lib/payments/checkout-service");
const { grantWrite, settleVerifiedNotification } = await import("@/lib/payments/entitlement-grant");

const USER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-22T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

type Calls = { rpc: Array<{ name: string; args: Record<string, unknown> }>; filters: string[][]; inserts: unknown[] };

/** Minimal admin double: auth user, payment_orders reads, the capped-insert RPC and updates. */
function adminDouble(opts: {
  createdAt?: string | null;
  userError?: boolean;
  promoRows?: unknown[];
  promoError?: unknown;
  rpc?: { data: unknown; error?: unknown };
}) {
  const calls: Calls = { rpc: [], filters: [], inserts: [] };
  const from = () => {
    const filters: string[] = [];
    calls.filters.push(filters);
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "neq", "not", "is", "gte", "limit", "update"]) {
      chain[op] = (...args: unknown[]) => {
        filters.push(`${op}:${args.map(String).join(",")}`);
        return chain;
      };
    }
    chain.insert = (row: unknown) => {
      calls.inserts.push(row);
      return chain;
    };
    chain.maybeSingle = async () => ({ data: { id: "o1" }, error: null });
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: opts.promoRows ?? [], error: opts.promoError ?? null, count: 0 });
    return chain;
  };
  return {
    calls,
    client: {
      auth: {
        admin: {
          getUserById: async () =>
            opts.userError ? { data: { user: null }, error: { message: "x" } } : { data: { user: { id: USER, created_at: opts.createdAt ?? null } }, error: null },
        },
      },
      from,
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.rpc.push({ name, args });
        return { data: opts.rpc?.data ?? [{ status: "ok", order_id: "o1" }], error: opts.rpc?.error ?? null };
      },
    },
  };
}

describe("starter offer price (server only)", () => {
  it("is -30% rounded to the grosz, on packs only", () => {
    expect(STARTER_PACK_OFFER).toEqual({ code: "starter30", percentOff: 30, windowHours: 48 });
    expect(starterPackGrosz(999)).toBe(699);
    expect(starterPackGrosz(1499)).toBe(1049);
    expect(starterPackGrosz(2499)).toBe(1749);
    expect(checkoutPrice({ kind: "pack", pack: "take" }, "FREE", true)).toEqual({ amountGrosz: 699, regularAmountGrosz: 999, promoCode: "starter30" });
    expect(checkoutPrice({ kind: "pack", pack: "master" }, "FREE", true)).toEqual({ amountGrosz: 1049, regularAmountGrosz: 1499, promoCode: "starter30" });
    expect(checkoutPrice({ kind: "pack", pack: "youtube" }, "GOLD", true).amountGrosz).toBe(699);
    expect(checkoutPrice({ kind: "pack", pack: "youtube" }, "SILVER", true).amountGrosz).toBe(1049);
    expect(checkoutPrice({ kind: "pack", pack: "youtube" }, "BRONZE", true).amountGrosz).toBe(1749);
    expect(checkoutPrice({ kind: "pack", pack: "take" }, "FREE", false)).toEqual({ amountGrosz: 999, regularAmountGrosz: null, promoCode: null });
  });

  it("never discounts plans, add-ons or beats", () => {
    const plan = { kind: "plan", tier: "SILVER", period: "month" } as const;
    const addon = { kind: "addon", addon: "reference_mastering", period: "month" } as const;
    const beat = { kind: "beat", beatId: "44444444-4444-4444-8444-444444444444" } as const;
    for (const product of [plan, addon, beat]) {
      expect(checkoutPrice(product, "SILVER", true)).toEqual({ amountGrosz: priceGrosz(product, "SILVER"), regularAmountGrosz: null, promoCode: null });
    }
  });

  it("youtube units follow the regular and the starter price, which never overlap", () => {
    for (const offer of Object.values(YOUTUBE_PACK_OFFERS)) {
      const regular = Math.round(offer.pricePln * 100);
      expect(youtubeUnitsForGrosz(regular)).toBe(offer.units);
      expect(youtubeUnitsForGrosz(starterPackGrosz(regular))).toBe(offer.units);
    }
    expect(youtubeUnitsForGrosz(700)).toBeNull();
    expect(youtubeUnitsForGrosz(0)).toBeNull();
  });
});

describe("starterOfferWindow", () => {
  it("is open for 48 h from signup, counting whole hours up", () => {
    expect(starterOfferWindow(new Date(NOW.getTime() - HOUR / 2).toISOString(), NOW)).toEqual({
      endsAt: new Date(NOW.getTime() + 47.5 * HOUR).toISOString(),
      hoursLeft: 48,
    });
    expect(starterOfferWindow(new Date(NOW.getTime() - 47.9 * HOUR).toISOString(), NOW)?.hoursLeft).toBe(1);
    expect(starterOfferWindow(new Date(NOW.getTime() - 48 * HOUR).toISOString(), NOW)).toBeNull();
    expect(starterOfferWindow(new Date(NOW.getTime() - 30 * 24 * HOUR).toISOString(), NOW)).toBeNull();
  });

  it("refuses missing, garbage and future dates", () => {
    expect(starterOfferWindow(null, NOW)).toBeNull();
    expect(starterOfferWindow("nope", NOW)).toBeNull();
    expect(starterOfferWindow(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBeNull();
  });
});

describe("loadStarterOffer", () => {
  const fresh = new Date(NOW.getTime() - 2 * HOUR).toISOString();

  it("offers to a fresh account without a discounted order", async () => {
    const { client, calls } = adminDouble({ createdAt: fresh });
    expect(await loadStarterOffer(USER, NOW, client as never)).toMatchObject({ hoursLeft: 46 });
    expect(calls.filters[0]).toEqual(expect.arrayContaining(["eq:user_id," + USER, "not:promo_code,is,null", "neq:status,failed"]));
  });

  it("does not offer once a discounted order is pending / paid / refunded, after 48 h, or on read errors", async () => {
    expect(await loadStarterOffer(USER, NOW, adminDouble({ createdAt: fresh, promoRows: [{ id: "x" }] }).client as never)).toBeNull();
    expect(await loadStarterOffer(USER, NOW, adminDouble({ createdAt: new Date(NOW.getTime() - 49 * HOUR).toISOString() }).client as never)).toBeNull();
    // Column missing before migration 20261122120000 → no offer, checkout stays at the regular price.
    expect(await loadStarterOffer(USER, NOW, adminDouble({ createdAt: fresh, promoError: { code: "42703" } }).client as never)).toBeNull();
    expect(await loadStarterOffer(USER, NOW, adminDouble({ userError: true }).client as never)).toBeNull();
  });
});

describe("createPendingOrder with a discounted order", () => {
  const order = { user_id: USER, session_id: "sess-starter", amount_grosz: 699, promo_code: "starter30", regular_amount_grosz: 999 };

  it("maps promo_used from the atomic RPC to PROMO", async () => {
    const { client } = adminDouble({ rpc: { data: [{ status: "promo_used", order_id: null }] } });
    expect(await createPendingOrder(client as never, order, NOW)).toBe("PROMO");
  });

  it("never inserts a discounted order without the RPC (no atomic guard)", async () => {
    const { client, calls } = adminDouble({ rpc: { data: null, error: { code: "PGRST202" } } });
    expect(await createPendingOrder(client as never, order, NOW)).toBe("PROMO");
    expect(calls.inserts).toHaveLength(0);
  });
});

describe("startCheckout prices the starter offer on the server", () => {
  const context = { userId: USER, email: "a@b.pl", profile: {} as never, permissions: [] };
  const consent = { acceptTerms: true, immediatePerformance: true };
  const run = (body: Record<string, unknown>) => startCheckout({ context, body: { consent, ...body }, locale: "pl", customerIp: "203.0.113.7", now: NOW });

  beforeEach(() => {
    vi.stubEnv("PLAN_PAYMENTS_AVAILABLE", "1");
    vi.stubEnv("PAYU_POS_ID", "4510332");
    vi.stubEnv("PAYU_CLIENT_SECRET", "client-secret");
    vi.stubEnv("PAYU_MD5_KEY", "md5");
    vi.stubEnv("PAYU_SANDBOX", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.bitrymdym.pl");
    loadPlanSnapshot.mockResolvedValue(null);
    loadAddonSnapshot.mockResolvedValue(null);
    registerPayuOrder.mockResolvedValue({ redirectUrl: "https://secure.snd.payu.com/pay/?orderId=X", orderId: "X" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    loadPlanSnapshot.mockReset();
    loadAddonSnapshot.mockReset();
    registerPayuOrder.mockReset();
    createSupabaseAdminClient.mockReset();
  });

  it("charges 6,99 zł for a take pack on a fresh account and marks the order", async () => {
    const fake = adminDouble({ createdAt: new Date(NOW.getTime() - HOUR).toISOString() });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    // A client-sent amount is ignored.
    expect(await run({ product: { kind: "pack", pack: "take" }, amountGrosz: 1, starter: true })).toMatchObject({ ok: true });
    const order = fake.calls.rpc[0]?.args.p_order as Record<string, unknown>;
    expect(order).toMatchObject({ product_kind: "pack", pack: "take", amount_grosz: 699, promo_code: "starter30", regular_amount_grosz: 999 });
    expect(registerPayuOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountGrosz: 699 }));
  });

  it("charges the regular price after 48 h and leaves the order unmarked", async () => {
    const fake = adminDouble({ createdAt: new Date(NOW.getTime() - 72 * HOUR).toISOString() });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    expect(await run({ product: { kind: "pack", pack: "master" } })).toMatchObject({ ok: true });
    const order = fake.calls.rpc[0]?.args.p_order as Record<string, unknown>;
    expect(order.amount_grosz).toBe(1499);
    expect(order).not.toHaveProperty("promo_code");
    expect(order).not.toHaveProperty("regular_amount_grosz");
  });

  it("refuses (PROMO) when the page showed the discount but it has lapsed, instead of charging more", async () => {
    const fake = adminDouble({ createdAt: new Date(NOW.getTime() - 72 * HOUR).toISOString() });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    expect(await run({ product: { kind: "pack", pack: "take" }, starter: true })).toEqual({ ok: false, code: "PROMO" });
    expect(registerPayuOrder).not.toHaveBeenCalled();
  });

  it("does not discount a plan for a fresh account", async () => {
    const fake = adminDouble({ createdAt: new Date(NOW.getTime() - HOUR).toISOString() });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    expect(await run({ product: { kind: "plan", tier: "BRONZE", period: "month" }, starter: true })).toMatchObject({ ok: true });
    const order = fake.calls.rpc[0]?.args.p_order as Record<string, unknown>;
    expect(order.amount_grosz).toBe(priceGrosz({ kind: "plan", tier: "BRONZE", period: "month" }));
    expect(order).not.toHaveProperty("promo_code");
  });
});

describe("settlement accepts the discounted amount stored on the order", () => {
  const base = { status: "pending", grantStatus: "pending", currency: "PLN" } as const;
  const note = (amountGrosz: number) => ({ amountGrosz, currency: "PLN", merchantId: 1, posId: 1 });

  it("grants a 6,99 zł youtube pack with 2 units and rejects the regular amount for it", () => {
    const order = { ...base, amountGrosz: 699, product: { kind: "pack", pack: "youtube" } as const };
    const ok = settleVerifiedNotification({ order, notification: note(699), merchantId: 1, posId: 1, plan: null, addon: null, now: NOW });
    expect(ok).toMatchObject({ kind: "granted", write: { action: "pack", pack: "youtube", units: 2 } });
    const wrong = settleVerifiedNotification({ order, notification: note(999), merchantId: 1, posId: 1, plan: null, addon: null, now: NOW });
    expect(wrong).toEqual({ kind: "rejected", code: "amount" });
    expect(grantWrite({ kind: "pack", pack: "youtube" }, null, null, NOW, 1749)).toEqual({ action: "pack", pack: "youtube", units: 1 });
  });
});

describe("starter offer migration", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261122120000_starter_pack_offer.sql"), "utf8");

  it("adds the columns, a pack-only check and the one-per-account guard under the user lock", () => {
    expect(sql).toMatch(/add column if not exists promo_code text/);
    expect(sql).toMatch(/add column if not exists regular_amount_grosz integer/);
    expect(sql).toMatch(/promo_code = 'starter30'\s+and product_kind = 'pack'/);
    expect(sql).toMatch(/regular_amount_grosz > amount_grosz/);
    const body = sql.slice(sql.indexOf("create or replace function public.create_payment_order_capped"));
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(body.indexOf("promo_used"));
    expect(body.indexOf("promo_used")).toBeLessThan(body.indexOf("insert into public.payment_orders"));
    expect(body).toMatch(/o\.status <> 'failed'/);
    expect(body).toMatch(/terms_accepted_at, immediate_performance, promo_code, regular_amount_grosz\)/);
    expect(sql).toMatch(/grant execute on function public\.create_payment_order_capped\(uuid, jsonb, integer, integer\) to service_role/);
    expect(sql).not.toMatch(/drop table|truncate|delete from/i);
  });
});
