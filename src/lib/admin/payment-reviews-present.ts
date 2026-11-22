/**
 * Pure helpers for the admin "refunds to check" list. No database access.
 */

export const ADMIN_PAYMENT_REVIEWS_LIMIT = 100;

/** Same shape the PayU ids and apply_p24_refund accept. */
export const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const REASONS = [
  "refund_partial",
  "refund_amount_mismatch",
  "refund_needs_manual_review",
  "refund_unpaid_order",
  "refund_ext_mismatch",
  "beat_sold_to_other",
  "unknown_pack_amount",
  "pending_plan_conflict",
  "failed_order_rejected",
  "failed_order_not_completed",
  "failed_order_reopen_refused",
] as const;

export type PaymentReviewReason = (typeof REASONS)[number];

/** Refund reviews where taking the purchase away equals what a full refund would do. */
const REVOCABLE_REASONS: readonly string[] = ["refund_partial", "refund_amount_mismatch"];

export function paymentReviewReason(reason: string): PaymentReviewReason | null {
  return (REASONS as readonly string[]).includes(reason) ? (reason as PaymentReviewReason) : null;
}

export function canRevokePaymentReview(reason: string, orderStatus: string | null): boolean {
  return REVOCABLE_REASONS.includes(reason) && orderStatus === "paid";
}

/** Refund amount stored by apply_p24_refund in details (grosz), or null. */
export function paymentReviewRefundAmount(details: unknown): number | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>).refund_amount;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** PayU refund id when it is safe, else a stable id built from the review id. */
export function paymentReviewRefundId(providerRef: string | null, reviewId: string): string {
  if (providerRef && SAFE_PROVIDER_ID.test(providerRef)) return providerRef;
  return `admin_${reviewId.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 64);
}

/** apply_p24_refund looks the order up by this id. */
export function paymentReviewProviderOrderId(order: {
  p24_order_id: string | null;
  provider_order_id: string | null;
}): string | null {
  const id = order.p24_order_id ?? order.provider_order_id;
  return id && SAFE_PROVIDER_ID.test(id) ? id : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePaymentReviewId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}
