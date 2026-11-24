import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkPayuOrder = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments/payu-client", () => ({ checkPayuOrder }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/email/notify/server", () => ({ sendNotification }));

const { POST } = await import("@/app/api/webhooks/payu/route");
const { payuBodyMd5 } = await import("@/lib/payments/payu-sign");

const KEY = "md5-test-key";
const SESSION = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "ORD123ABC";

type Tables = Record<string, { data: unknown; error?: unknown }>;
type RpcMap = Record<string, { data: unknown; error?: unknown }>;

function fakeAdmin(tables: Tables, rpcs: RpcMap) {
  const upserts: unknown[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const builder = (table: string) => {
    const result = () => ({ data: tables[table]?.data ?? null, error: tables[table]?.error ?? null });
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = () => chain;
    chain.gt = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.update = () => chain;
    chain.maybeSingle = async () => result();
    chain.upsert = async (row: unknown) => {
      upserts.push({ table, row });
      return { data: null, error: tables[`${table}:upsert`]?.error ?? null };
    };
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result());
    return chain;
  };
  return {
    upserts,
    rpcCalls,
    client: {
      from: builder,
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: rpcs[name]?.data ?? null, error: rpcs[name]?.error ?? null };
      },
    },
  };
}

function post(payload: unknown, opts: { badSign?: boolean } = {}) {
  const raw = JSON.stringify(payload);
  const sig = opts.badSign ? "0".repeat(32) : payuBodyMd5(raw, KEY);
  return POST(
    new Request("http://localhost/api/webhooks/payu", {
      method: "POST",
      headers: { "content-type": "application/json", "openpayu-signature": `sender=checkout;signature=${sig};algorithm=MD5;content=DOCUMENT` },
      body: raw,
    }),
  );
}

function orderNote(status = "COMPLETED", total = "1499") {
  return {
    order: { orderId: ORDER_ID, extOrderId: SESSION, status, totalAmount: total, currencyCode: "PLN", merchantPosId: "4510332" },
  };
}

function refundNote(over: Record<string, unknown> = {}) {
  return {
    orderId: ORDER_ID,
    extOrderId: SESSION,
    refund: { refundId: "5000009999", amount: "1499", currencyCode: "PLN", status: "FINALIZED", ...over },
  };
}

function orderRow(over: Record<string, unknown> = {}) {
  return {
    user_id: "u1",
    session_id: SESSION,
    product_kind: "pack",
    plan_tier: null,
    addon: null,
    pack: "youtube",
    beat_id: null,
    period: "once",
    amount_grosz: 1499,
    currency: "PLN",
    status: "pending",
    grant_status: "pending",
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("PAYU_POS_ID", "4510332");
  vi.stubEnv("PAYU_CLIENT_SECRET", "client-secret");
  vi.stubEnv("PAYU_MD5_KEY", KEY);
  vi.stubEnv("PAYU_SANDBOX", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  checkPayuOrder.mockReset();
  createSupabaseAdminClient.mockReset();
  sendNotification.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PayU webhook refunds", () => {
  it("rejects a refund with a bad signature before touching the database", async () => {
    const res = await post(refundNote(), { badSign: true });
    expect(res.status).toBe(400);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("applies a FINALIZED refund by orderId through apply_p24_refund with pack units", async () => {
    const fake = fakeAdmin({ payment_orders: { data: { session_id: SESSION, product_kind: "pack", pack: "youtube", amount_grosz: 1499 } } }, {
      apply_p24_refund: { data: { result: "refunded" } },
    });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    const res = await post(refundNote());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "refunded" });
    expect(fake.rpcCalls).toEqual([
      {
        name: "apply_p24_refund",
        args: { p_provider_order_id: ORDER_ID, p_refund_id: "5000009999", p_refund_amount: 1499, p_currency: "PLN", p_units: 1 },
      },
    ]);
  });

  it("acks a replayed refund as already and a PENDING refund without a write", async () => {
    const fake = fakeAdmin({ payment_orders: { data: { session_id: SESSION, product_kind: "plan", pack: null, amount_grosz: 1499 } } }, {
      apply_p24_refund: { data: { result: "already" } },
    });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    expect(await (await post(refundNote())).json()).toEqual({ ok: true, result: "already" });
    const pending = await post(refundNote({ status: "PENDING" }));
    expect(await pending.json()).toEqual({ ok: true, result: "ignored" });
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it("returns 503 when the refund rpc fails and 400 for a malformed refund", async () => {
    const fake = fakeAdmin({ payment_orders: { data: { session_id: SESSION, product_kind: "plan", pack: null, amount_grosz: 1499 } } }, {
      apply_p24_refund: { data: null, error: { message: "x" } },
    });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    expect((await post(refundNote())).status).toBe(503);
    expect((await post(refundNote({ amount: "-5" }))).status).toBe(400);
  });

  it("queues a refund whose extOrderId does not match the order found by orderId", async () => {
    const fake = fakeAdmin({ payment_orders: { data: { session_id: "22222222-2222-4222-8222-222222222222", product_kind: "plan", pack: null, amount_grosz: 1499 } } }, {});
    createSupabaseAdminClient.mockReturnValue(fake.client);
    const res = await post(refundNote());
    expect(await res.json()).toEqual({ ok: true, result: "review" });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.upserts).toHaveLength(1);
  });

  it("acks a refund for an unknown order without a retry loop", async () => {
    createSupabaseAdminClient.mockReturnValue(fakeAdmin({ payment_orders: { data: null } }, {}).client);
    const res = await post(refundNote());
    expect(await res.json()).toEqual({ ok: true, result: "ignored" });
  });
});

describe("PayU webhook pack and failed-order paths", () => {
  it("grants a known youtube amount with units computed in TypeScript", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow() } }, { grant_p24_quota_pack: { data: { result: "granted" } } });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("ok");
    const res = await post(orderNote());
    expect(res.status).toBe(200);
    expect(fake.rpcCalls[0]?.name).toBe("grant_p24_quota_pack");
    expect(fake.rpcCalls[0]?.args.p_units).toBe(1);
  });

  it("answers 200 and writes a review for an unknown pack amount instead of a 503 loop", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow({ amount_grosz: 1234 }) } }, { park_paid_payment_order: { data: { result: "parked" } } });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("ok");
    const res = await post(orderNote("COMPLETED", "1234"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "review" });
    expect(JSON.stringify(fake.upserts)).toContain("unknown_pack_amount");
    // Nothing granted; the order leaves "pending" with the PayU id, so nothing grants it later.
    expect(fake.rpcCalls).toEqual([
      { name: "park_paid_payment_order", args: { p_session_id: SESSION, p_amount: 1234, p_provider_order_id: ORDER_ID, p_note: "pack_amount" } },
    ]);
  });

  it("asks PayU to retry when a reviewed order could not be parked", async () => {
    createSupabaseAdminClient.mockReturnValue(
      fakeAdmin({ payment_orders: { data: orderRow({ amount_grosz: 1234 }) } }, { park_paid_payment_order: { data: { result: "order_state" } } }).client,
    );
    checkPayuOrder.mockResolvedValue("ok");
    expect((await post(orderNote("COMPLETED", "1234"))).status).toBe(503);
  });

  it("answers 503 for an unknown pack amount when the review row cannot be stored", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow({ amount_grosz: 1234 }) }, "payment_order_reviews:upsert": { data: null, error: { message: "x" } } }, {});
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("ok");
    expect((await post(orderNote("COMPLETED", "1234"))).status).toBe(503);
  });

  it("a bought plan extends live recordings; a pack or a skipped plan does not", async () => {
    checkPayuOrder.mockResolvedValue("ok");
    const plan = { product_kind: "plan", plan_tier: "SILVER", pack: null, period: "month", amount_grosz: 2999 };
    for (const result of ["granted", "skipped"]) {
      const fake = fakeAdmin({ payment_orders: { data: orderRow(plan) } }, { apply_p24_purchase: { data: { result } } });
      createSupabaseAdminClient.mockReturnValue(fake.client);
      expect(await (await post(orderNote("COMPLETED", "2999"))).json()).toEqual({ ok: true, result });
      expect(fake.rpcCalls.map((c) => c.name)).toEqual(
        result === "granted" ? ["apply_p24_purchase", "extend_take_retention_for_owner"] : ["apply_p24_purchase"],
      );
    }
  });

  it("still requires PayU confirmation before any grant", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow() } }, {});
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("mismatch");
    expect((await post(orderNote())).status).toBe(503);
    checkPayuOrder.mockResolvedValue("unavailable");
    expect((await post(orderNote())).status).toBe(503);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("reopens a failed order after a verified COMPLETED and then grants", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow({ status: "failed" }) } }, {
      reopen_failed_payment_order: { data: { result: "reopened" } },
      grant_p24_quota_pack: { data: { result: "granted" } },
    });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("ok");
    const res = await post(orderNote());
    expect(res.status).toBe(200);
    expect(fake.rpcCalls.map((c) => c.name)).toEqual(["reopen_failed_payment_order", "grant_p24_quota_pack"]);
  });

  it("does not reopen a failed order PayU does not report as COMPLETED and queues a review", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow({ status: "failed" }) } }, {});
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("mismatch");
    const res = await post(orderNote());
    expect(await res.json()).toEqual({ ok: true, result: "review" });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(JSON.stringify(fake.upserts)).toContain("failed_order_not_completed");
  });

  it("queues a failed order whose notice amount differs instead of answering 400", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow({ status: "failed" }) } }, {});
    createSupabaseAdminClient.mockReturnValue(fake.client);
    const res = await post(orderNote("COMPLETED", "99"));
    expect(res.status).toBe(200);
    expect(checkPayuOrder).not.toHaveBeenCalled();
    expect(JSON.stringify(fake.upserts)).toContain("failed_order_rejected");
  });

  it("keeps 400 for an amount mismatch on a pending order and treats a refunded order as already", async () => {
    createSupabaseAdminClient.mockReturnValue(fakeAdmin({ payment_orders: { data: orderRow() } }, {}).client);
    expect((await post(orderNote("COMPLETED", "99"))).status).toBe(400);
    createSupabaseAdminClient.mockReturnValue(fakeAdmin({ payment_orders: { data: orderRow({ status: "refunded", grant_status: "granted" }) } }, {}).client);
    expect(await (await post(orderNote())).json()).toEqual({ ok: true, result: "already" });
  });
});

describe("PayU webhook: starter offer (-30%) orders", () => {
  it("grants a discounted youtube pack (Gold 6,99 zł) with the regular 2 units", async () => {
    const fake = fakeAdmin({ payment_orders: { data: orderRow({ amount_grosz: 699, promo_code: "starter30", regular_amount_grosz: 999 }) } }, {
      grant_p24_quota_pack: { data: { result: "granted" } },
    });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("ok");
    const res = await post(orderNote("COMPLETED", "699"));
    expect(res.status).toBe(200);
    expect(checkPayuOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountGrosz: 699 }));
    expect(fake.rpcCalls[0]).toMatchObject({ name: "grant_p24_quota_pack", args: { p_amount: 699, p_units: 2 } });
  });

  it("grants a discounted take pack at 6,99 zł and rejects PayU reporting the regular price for it", async () => {
    const take = () => orderRow({ pack: "take", amount_grosz: 699, promo_code: "starter30", regular_amount_grosz: 999 });
    const fake = fakeAdmin({ payment_orders: { data: take() } }, { grant_p24_quota_pack: { data: { result: "granted" } } });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    checkPayuOrder.mockResolvedValue("ok");
    expect((await post(orderNote("COMPLETED", "699"))).status).toBe(200);
    expect(fake.rpcCalls[0]?.args).toMatchObject({ p_pack: "take", p_units: 10, p_amount: 699 });

    createSupabaseAdminClient.mockReturnValue(fakeAdmin({ payment_orders: { data: take() } }, {}).client);
    expect((await post(orderNote("COMPLETED", "999"))).status).toBe(400);
  });

  it("refunds a discounted youtube pack against the amount actually paid, with the regular units", async () => {
    const fake = fakeAdmin({ payment_orders: { data: { session_id: SESSION, product_kind: "pack", pack: "youtube", amount_grosz: 1049 } } }, {
      apply_p24_refund: { data: { result: "refunded" } },
    });
    createSupabaseAdminClient.mockReturnValue(fake.client);
    const res = await post(refundNote({ amount: "1049" }));
    expect(await res.json()).toEqual({ ok: true, result: "refunded" });
    expect(fake.rpcCalls[0]?.args).toMatchObject({ p_refund_amount: 1049, p_units: 1 });
  });
});
