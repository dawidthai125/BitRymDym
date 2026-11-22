/**
 * Admin "refunds to check": open payment_order_reviews and their one-click resolution.
 * Reading needs ADMIN + payments.view; resolving needs ADMIN + payments.manage.
 */

import "server-only";

import { hasPermission, hasRole } from "@/lib/auth/permissions";
import { AuthError, requireUser } from "@/lib/auth/session";
import {
  ORDER_SELECT,
  asOrder,
  requireAdminPaymentHistoryAccess,
  type OrderRecord,
} from "@/lib/admin/payment-history";
import {
  ADMIN_PAYMENT_REVIEWS_LIMIT,
  canRevokePaymentReview,
  parsePaymentReviewId,
  paymentReviewProviderOrderId,
  paymentReviewRefundAmount,
  paymentReviewRefundId,
} from "@/lib/admin/payment-reviews-present";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminPaymentReviewRow = {
  id: string;
  createdAt: string;
  reason: string;
  refundAmount: number | null;
  order: OrderRecord | null;
  userId: string | null;
  buyerEmail: string | null;
  displayName: string | null;
  userNumber: number | null;
  canRevoke: boolean;
};

export type AdminPaymentReviewsResult = {
  rows: AdminPaymentReviewRow[];
  canManage: boolean;
};

export type AdminPaymentReviewCode =
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "ALREADY_CLOSED"
  | "NOT_REVOCABLE"
  | "NO_PROVIDER_ID"
  | "REFUND_FAILED"
  | "RESOLVE_FAILED";

export type AdminPaymentReviewOutcome =
  | { ok: true; revoked: boolean; newReview: boolean }
  | { ok: false; code: AdminPaymentReviewCode };

type ReviewRecord = {
  id: string;
  order_id: string | null;
  reason: string;
  provider_ref: string;
  details: unknown;
  status: string;
  created_at: string;
};

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function canManagePayments(role: Parameters<typeof hasRole>[0], permissions: readonly string[]): boolean {
  return hasRole(role, ["ADMIN"]) && hasPermission(permissions, "payments.manage");
}

export async function requireAdminPaymentManageAccess() {
  const context = await requireUser();
  if (!canManagePayments(context.profile.role, context.permissions)) {
    throw new AuthError("FORBIDDEN", "Insufficient role.");
  }
  return context;
}

function asReview(value: unknown): ReviewRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ReviewRecord>;
  if (typeof row.id !== "string" || typeof row.reason !== "string") return null;
  if (typeof row.created_at !== "string" || typeof row.status !== "string") return null;
  return {
    id: row.id,
    order_id: typeof row.order_id === "string" ? row.order_id : null,
    reason: row.reason,
    provider_ref: typeof row.provider_ref === "string" ? row.provider_ref : "",
    details: row.details ?? null,
    status: row.status,
    created_at: row.created_at,
  };
}

const REVIEW_SELECT = "id, order_id, reason, provider_ref, details, status, created_at" as const;

export async function listOpenPaymentReviews(): Promise<AdminPaymentReviewsResult> {
  const context = await requireAdminPaymentHistoryAccess();
  const canManage = canManagePayments(context.profile.role, context.permissions);
  const admin = createSupabaseAdminClient();
  const listed = await admin
    .from("payment_order_reviews")
    .select(REVIEW_SELECT)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(ADMIN_PAYMENT_REVIEWS_LIMIT);
  if (listed.error) throw new Error("admin_payment_reviews_load_failed");
  const reviews = (listed.data ?? []).map(asReview).filter((row): row is ReviewRecord => row !== null);

  const orderIds = [...new Set(reviews.map((r) => r.order_id).filter((id): id is string => id !== null))];
  const orders = new Map<string, OrderRecord>();
  if (orderIds.length > 0) {
    const found = await admin.from("payment_orders").select(ORDER_SELECT).in("id", orderIds);
    if (!found.error) {
      for (const raw of found.data ?? []) {
        const order = asOrder(raw);
        if (order) orders.set(order.id, order);
      }
    }
  }

  const userIds = [...new Set([...orders.values()].map((o) => o.user_id))];
  const names = new Map<string, { displayName: string | null; userNumber: number | null }>();
  if (userIds.length > 0) {
    const profiles = await admin.from("profiles").select("id, display_name, user_number").in("id", userIds);
    if (!profiles.error) {
      for (const profile of profiles.data ?? []) {
        if (!profile || typeof profile.id !== "string") continue;
        names.set(profile.id, {
          displayName: typeof profile.display_name === "string" ? profile.display_name : null,
          userNumber: typeof profile.user_number === "number" ? profile.user_number : null,
        });
      }
    }
  }

  return {
    canManage,
    rows: reviews.map((review) => {
      const order = review.order_id ? orders.get(review.order_id) ?? null : null;
      const profile = order ? names.get(order.user_id) : undefined;
      return {
        id: review.id,
        createdAt: review.created_at,
        reason: review.reason,
        refundAmount: paymentReviewRefundAmount(review.details),
        order,
        userId: order?.user_id ?? null,
        buyerEmail: order?.buyer_email ?? null,
        displayName: profile?.displayName ?? null,
        userNumber: profile?.userNumber ?? null,
        canRevoke: canManage && canRevokePaymentReview(review.reason, order?.status ?? null),
      };
    }),
  };
}

async function loadOpenReview(
  admin: AdminClient,
  reviewId: string,
): Promise<{ ok: true; review: ReviewRecord } | { ok: false; code: AdminPaymentReviewCode }> {
  const found = await admin.from("payment_order_reviews").select(REVIEW_SELECT).eq("id", reviewId).maybeSingle();
  if (found.error) return { ok: false, code: "RESOLVE_FAILED" };
  const review = asReview(found.data);
  if (!review) return { ok: false, code: "NOT_FOUND" };
  if (review.status !== "open") return { ok: false, code: "ALREADY_CLOSED" };
  return { ok: true, review };
}

async function markResolved(admin: AdminClient, reviewId: string): Promise<boolean> {
  const updated = await admin
    .from("payment_order_reviews")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("status", "open");
  return !updated.error;
}

async function writeAudit(
  admin: AdminClient,
  input: {
    actorUserId: string;
    targetUserId: string | null;
    review: ReviewRecord;
    mode: "revoke" | "close";
    orderStatus: string | null;
    result: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("admin_audit_events").insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    action: "PAYMENT_REVIEW_RESOLVE",
    old_value: { reviewId: input.review.id, reason: input.review.reason, orderStatus: input.orderStatus },
    new_value: { mode: input.mode, ...input.result },
    metadata: { panel: "admin_payments", orderId: input.review.order_id },
  });
  if (error) console.error("[admin] payment review audit failed", error.message);
}

function authCode(error: unknown): AdminPaymentReviewCode | null {
  if (error instanceof AuthError && (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")) {
    return error.code;
  }
  return null;
}

/** Takes the purchase away exactly like a full PayU refund, then closes the review. */
export async function revokeAndResolvePaymentReview(rawReviewId: unknown): Promise<AdminPaymentReviewOutcome> {
  let actorUserId: string;
  try {
    actorUserId = (await requireAdminPaymentManageAccess()).userId;
  } catch (error) {
    const code = authCode(error);
    if (code) return { ok: false, code };
    throw error;
  }
  const reviewId = parsePaymentReviewId(rawReviewId);
  if (!reviewId) return { ok: false, code: "INVALID_INPUT" };

  const admin = createSupabaseAdminClient();
  const loaded = await loadOpenReview(admin, reviewId);
  if (!loaded.ok) return loaded;
  const { review } = loaded;
  if (!review.order_id) return { ok: false, code: "NOT_REVOCABLE" };

  const found = await admin
    .from("payment_orders")
    .select("id, user_id, status, amount_grosz, currency, p24_order_id, provider_order_id")
    .eq("id", review.order_id)
    .maybeSingle();
  if (found.error) return { ok: false, code: "REFUND_FAILED" };
  const order = found.data as {
    id: string;
    user_id: string;
    status: string | null;
    amount_grosz: number | null;
    currency: string | null;
    p24_order_id: string | null;
    provider_order_id: string | null;
  } | null;
  if (!order) return { ok: false, code: "NOT_FOUND" };
  if (
    !canRevokePaymentReview(review.reason, order.status) ||
    typeof order.amount_grosz !== "number" ||
    !Number.isSafeInteger(order.amount_grosz) ||
    order.amount_grosz <= 0
  ) {
    return { ok: false, code: "NOT_REVOCABLE" };
  }
  const providerOrderId = paymentReviewProviderOrderId(order);
  if (!providerOrderId) return { ok: false, code: "NO_PROVIDER_ID" };

  const applied = await admin.rpc("apply_p24_refund", {
    p_provider_order_id: providerOrderId,
    p_refund_id: paymentReviewRefundId(review.provider_ref, review.id),
    p_refund_amount: order.amount_grosz,
    p_currency: "PLN",
    p_units: null,
  });
  if (applied.error) {
    console.error("[admin] payment review refund rpc failed", { reviewId });
    return { ok: false, code: "REFUND_FAILED" };
  }
  const data = (applied.data ?? {}) as { result?: string; revoked?: boolean; review?: boolean };
  // "already": the order was refunded in the meantime — nothing left to take away.
  if (data.result !== "refunded" && data.result !== "already") {
    console.error("[admin] payment review refund refused", { reviewId, result: data.result ?? "empty" });
    return { ok: false, code: "REFUND_FAILED" };
  }

  if (!(await markResolved(admin, reviewId))) return { ok: false, code: "RESOLVE_FAILED" };
  await writeAudit(admin, {
    actorUserId,
    targetUserId: order.user_id,
    review,
    mode: "revoke",
    orderStatus: order.status,
    result: { result: data.result, revoked: data.revoked === true, newReview: data.review === true },
  });
  return { ok: true, revoked: data.revoked === true, newReview: data.review === true };
}

/** Closes the review without touching the order. */
export async function closePaymentReview(rawReviewId: unknown): Promise<AdminPaymentReviewOutcome> {
  let actorUserId: string;
  try {
    actorUserId = (await requireAdminPaymentManageAccess()).userId;
  } catch (error) {
    const code = authCode(error);
    if (code) return { ok: false, code };
    throw error;
  }
  const reviewId = parsePaymentReviewId(rawReviewId);
  if (!reviewId) return { ok: false, code: "INVALID_INPUT" };

  const admin = createSupabaseAdminClient();
  const loaded = await loadOpenReview(admin, reviewId);
  if (!loaded.ok) return loaded;
  const { review } = loaded;

  let targetUserId: string | null = null;
  let orderStatus: string | null = null;
  if (review.order_id) {
    const found = await admin.from("payment_orders").select("user_id, status").eq("id", review.order_id).maybeSingle();
    const order = found.data as { user_id?: unknown; status?: unknown } | null;
    if (!found.error && order) {
      targetUserId = typeof order.user_id === "string" ? order.user_id : null;
      orderStatus = typeof order.status === "string" ? order.status : null;
    }
  }

  if (!(await markResolved(admin, reviewId))) return { ok: false, code: "RESOLVE_FAILED" };
  await writeAudit(admin, { actorUserId, targetUserId, review, mode: "close", orderStatus, result: {} });
  return { ok: true, revoked: false, newReview: false };
}
