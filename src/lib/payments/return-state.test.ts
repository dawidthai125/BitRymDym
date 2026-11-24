import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pl",
  getTranslations: async () => (key: string, v?: Record<string, unknown>) => (v ? `${key} ${JSON.stringify(v)}` : key),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const q = { select: () => q, eq: (...a: unknown[]) => (eq(...a), q), maybeSingle };
    return { from: () => q };
  },
}));

import { loadReturnState, paymentSuccess } from "@/lib/payments/return-state";

const ID = "11111111-1111-4111-8111-111111111111";
const order = (over: Record<string, unknown> = {}) => ({
  data: { product_kind: "plan", plan_tier: "SILVER", addon: null, status: "paid", grant_status: "granted", grant_note: null, granted_until: "2026-12-24T10:13:33Z", amount_grosz: 2999, ...over },
  error: null,
});

beforeEach(() => {
  maybeSingle.mockReset();
  eq.mockReset();
});

describe("payment success popup", () => {
  it("names the plan and its last day, only for the buyer's own order", async () => {
    maybeSingle.mockResolvedValue(order());
    expect(await paymentSuccess(ID, "u1")).toEqual({
      message: 'sukcesPlan {"co":"Silver","data":"24 grudnia 2026"}',
      purchase: { currency: "PLN", value: 29.99, items: [{ item_name: "plan_silver", quantity: 1, price: 29.99 }] },
    });
    expect(eq).toHaveBeenCalledWith("session_id", ID);
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("says a cheaper plan starts later", async () => {
    maybeSingle.mockResolvedValue(order({ grant_note: "schedule" }));
    expect((await paymentSuccess(ID, "u1"))?.message).toContain("sukcesZaplanowane");
  });

  it("stays silent for unpaid, refunded, missing or malformed orders", async () => {
    for (const over of [{ status: "pending" }, { status: "refunded" }, { status: "failed" }]) {
      maybeSingle.mockResolvedValue(order(over));
      expect(await paymentSuccess(ID, "u1")).toBeNull();
    }
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await paymentSuccess(ID, "u1")).toBeNull();
    expect(await paymentSuccess("x", "u1")).toBeNull();
    expect(await paymentSuccess([ID], "u1")).toBeNull();
  });

  it("keeps pending when the order cannot be read", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await loadReturnState(ID, "u1")).toEqual({ status: "pending" });
  });
});
