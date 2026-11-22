import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, requireUser } from "@/lib/auth/session";
import { closePaymentReview, revokeAndResolvePaymentReview } from "@/lib/admin/payment-reviews";
import {
  canRevokePaymentReview,
  paymentReviewProviderOrderId,
  paymentReviewRefundAmount,
  paymentReviewRefundId,
} from "@/lib/admin/payment-reviews-present";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth/types";
import type { PermissionKey } from "@/types/permissions";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const requireUserMock = vi.mocked(requireUser);
const adminMock = vi.mocked(createSupabaseAdminClient);

const REVIEW_ID = "11111111-2222-4333-8444-555555555555";

function context(role: AuthContext["profile"]["role"], permissions: PermissionKey[]): AuthContext {
  return {
    userId: "admin-1",
    email: "admin@example.com",
    profile: {
      id: "admin-1",
      displayName: "Admin",
      userNumber: 1,
      role,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions,
  };
}

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

function fakeAdmin(opts: {
  review?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  rpc?: { data: unknown; error: unknown };
  updateError?: unknown;
}) {
  const calls: Call[] = [];
  const rpc = vi.fn(async () => opts.rpc ?? { data: { result: "refunded", revoked: true, review: false }, error: null });
  function from(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const result = () => {
      if (call.op === "update") return { data: null, error: opts.updateError ?? null };
      if (call.op === "insert") return { data: null, error: null };
      if (table === "payment_order_reviews") return { data: opts.review ?? null, error: null };
      if (table === "payment_orders") return { data: opts.order ?? null, error: null };
      return { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return Promise.resolve(result());
      },
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      maybeSingle: () => Promise.resolve(result()),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  }
  return { client: { from, rpc }, calls, rpc };
}

const openPartial = {
  id: REVIEW_ID,
  order_id: "order-1",
  reason: "refund_partial",
  provider_ref: "RF123",
  details: { refund_amount: 2800, order_amount: 2999 },
  status: "open",
  created_at: "2026-11-22T10:00:00.000Z",
};

const paidOrder = {
  id: "order-1",
  user_id: "user-9",
  status: "paid",
  amount_grosz: 2999,
  currency: "PLN",
  p24_order_id: "PAYU1",
  provider_order_id: "PAYU2",
};

function use(fake: ReturnType<typeof fakeAdmin>) {
  adminMock.mockReturnValue(fake.client as unknown as ReturnType<typeof createSupabaseAdminClient>);
}

describe("payment review helpers", () => {
  it("offers removal only for refund reviews on a paid order", () => {
    expect(canRevokePaymentReview("refund_partial", "paid")).toBe(true);
    expect(canRevokePaymentReview("refund_partial", "refunded")).toBe(false);
    expect(canRevokePaymentReview("refund_unpaid_order", "paid")).toBe(false);
    expect(canRevokePaymentReview("pending_plan_conflict", "paid")).toBe(false);
  });

  it("builds safe ids and reads the refund amount", () => {
    expect(paymentReviewRefundId("RF123", REVIEW_ID)).toBe("RF123");
    const generated = paymentReviewRefundId("", REVIEW_ID);
    expect(generated).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    expect(paymentReviewRefundId("bad id!", REVIEW_ID)).toBe(generated);
    expect(paymentReviewProviderOrderId({ p24_order_id: null, provider_order_id: "PAYU2" })).toBe("PAYU2");
    expect(paymentReviewProviderOrderId({ p24_order_id: "PAYU1", provider_order_id: "PAYU2" })).toBe("PAYU1");
    expect(paymentReviewRefundAmount({ refund_amount: 2800 })).toBe(2800);
    expect(paymentReviewRefundAmount({})).toBeNull();
  });
});

describe("revokeAndResolvePaymentReview", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    adminMock.mockReset();
  });

  it("refuses anyone who is not an administrator with payments.manage", async () => {
    const fake = fakeAdmin({ review: openPartial, order: paidOrder });
    use(fake);
    requireUserMock.mockResolvedValue(context("MODERATOR", ["payments.manage"]));
    await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.view"]));
    await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    requireUserMock.mockRejectedValue(new AuthError("UNAUTHENTICATED", "Authentication required."));
    await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it("calls apply_p24_refund with the full order amount and then closes the review", async () => {
    const fake = fakeAdmin({ review: openPartial, order: paidOrder });
    use(fake);
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.view", "payments.manage"]));
    await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: true, revoked: true, newReview: false });
    expect(fake.rpc).toHaveBeenCalledWith("apply_p24_refund", {
      p_provider_order_id: "PAYU1",
      p_refund_id: "RF123",
      p_refund_amount: 2999,
      p_currency: "PLN",
      p_units: null,
    });
    const update = fake.calls.find((c) => c.op === "update");
    expect(update?.table).toBe("payment_order_reviews");
    expect(update?.payload).toMatchObject({ status: "resolved" });
    expect(update?.filters).toEqual([["id", REVIEW_ID], ["status", "open"]]);
    const audit = fake.calls.find((c) => c.op === "insert");
    expect(audit?.table).toBe("admin_audit_events");
    expect(audit?.payload).toMatchObject({ action: "PAYMENT_REVIEW_RESOLVE", target_user_id: "user-9" });
  });

  it("falls back to provider_order_id and a generated refund id", async () => {
    const fake = fakeAdmin({
      review: { ...openPartial, provider_ref: "" },
      order: { ...paidOrder, p24_order_id: null },
    });
    use(fake);
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.manage"]));
    await revokeAndResolvePaymentReview(REVIEW_ID);
    expect(fake.rpc).toHaveBeenCalledWith(
      "apply_p24_refund",
      expect.objectContaining({ p_provider_order_id: "PAYU2", p_refund_id: paymentReviewRefundId("", REVIEW_ID) }),
    );
  });

  it("does not close the review when the RPC fails or refuses", async () => {
    for (const rpc of [
      { data: null, error: { message: "boom" } },
      { data: { result: "conflict" }, error: null },
      { data: { result: "missing" }, error: null },
    ]) {
      const fake = fakeAdmin({ review: openPartial, order: paidOrder, rpc });
      use(fake);
      requireUserMock.mockResolvedValue(context("ADMIN", ["payments.manage"]));
      await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "REFUND_FAILED" });
      expect(fake.calls.some((c) => c.op === "update" || c.op === "insert")).toBe(false);
    }
  });

  it("does not touch an order that is no longer paid", async () => {
    const fake = fakeAdmin({ review: openPartial, order: { ...paidOrder, status: "refunded" } });
    use(fake);
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.manage"]));
    await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "NOT_REVOCABLE" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("rejects a closed review and a bad id", async () => {
    const fake = fakeAdmin({ review: { ...openPartial, status: "resolved" }, order: paidOrder });
    use(fake);
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.manage"]));
    await expect(revokeAndResolvePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "ALREADY_CLOSED" });
    await expect(revokeAndResolvePaymentReview("nope")).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("closePaymentReview", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    adminMock.mockReset();
  });

  it("marks the review resolved without calling the refund RPC", async () => {
    const fake = fakeAdmin({ review: openPartial, order: paidOrder });
    use(fake);
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.manage"]));
    await expect(closePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: true, revoked: false, newReview: false });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.calls.find((c) => c.op === "update")?.payload).toMatchObject({ status: "resolved" });
  });

  it("refuses a user without payments.manage", async () => {
    const fake = fakeAdmin({ review: openPartial, order: paidOrder });
    use(fake);
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.view"]));
    await expect(closePaymentReview(REVIEW_ID)).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    expect(fake.calls).toHaveLength(0);
  });
});
