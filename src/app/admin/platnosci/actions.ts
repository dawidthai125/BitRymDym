"use server";

import { revalidatePath } from "next/cache";

import {
  closePaymentReview,
  revokeAndResolvePaymentReview,
  type AdminPaymentReviewOutcome,
} from "@/lib/admin/payment-reviews";

export async function adminRevokePaymentReviewAction(reviewId: string): Promise<AdminPaymentReviewOutcome> {
  const outcome = await revokeAndResolvePaymentReview(reviewId);
  if (outcome.ok) revalidatePath("/admin/platnosci");
  return outcome;
}

export async function adminClosePaymentReviewAction(reviewId: string): Promise<AdminPaymentReviewOutcome> {
  const outcome = await closePaymentReview(reviewId);
  if (outcome.ok) revalidatePath("/admin/platnosci");
  return outcome;
}
