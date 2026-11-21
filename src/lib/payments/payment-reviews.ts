import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type PaymentReviewReason =
  | "unknown_pack_amount"
  | "pending_plan_conflict"
  | "failed_order_not_completed"
  | "failed_order_rejected"
  | "failed_order_reopen_refused"
  | "refund_ext_mismatch";

/**
 * Queue a payment for a human. Idempotent per (order_ref, reason, provider_ref): a PayU retry does not
 * add a second row. Returns false when the row could not be stored (caller answers 503 so PayU retries).
 */
export async function recordPaymentReview(
  admin: Admin,
  input: { orderRef: string; reason: PaymentReviewReason; providerRef?: string; details?: Record<string, string | number | boolean | null> },
): Promise<boolean> {
  const saved = await admin.from("payment_order_reviews").upsert(
    {
      order_ref: input.orderRef,
      reason: input.reason,
      provider_ref: input.providerRef ?? "",
      details: input.details ?? {},
    },
    { onConflict: "order_ref,reason,provider_ref", ignoreDuplicates: true },
  );
  if (saved.error) {
    console.error("[payu] review row not stored", { sessionId: input.orderRef, reason: input.reason });
    return false;
  }
  console.error("[payu] payment needs review", { sessionId: input.orderRef, reason: input.reason });
  return true;
}
