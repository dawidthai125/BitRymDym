import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { PremiumReturnView } from "@/components/premium/premium-return-view";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadReturnState, PAYMENT_SESSION_RE, PAYMENT_SUCCESS_PARAM } from "@/lib/payments/return-state";
import { reconcilePayuOrder } from "@/lib/payments/webhook-service";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.premiumPage.returnPage");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function PremiumReturnPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!PAYMENT_SESSION_RE.test(sessionId)) {
    return <PremiumReturnView state={{ status: "missing" }} />;
  }
  const context = await getCurrentProfile();
  if (!context) redirect(signInPathWithNext(`/premium/return/${sessionId}`));

  try {
    // 2026-11-22: a pending PayU order is re-checked with PayU here (lost notification).
    await reconcilePayuOrder(sessionId, context.userId);
  } catch {
    // The state below still tells the buyer what is known.
  }
  const state = await loadReturnState(sessionId, context.userId);
  // Owner 2026-11-24: a settled purchase goes to the account, with the green popup.
  if (state.status === "paid") redirect(`/account?${PAYMENT_SUCCESS_PARAM}=${sessionId}`);
  return <PremiumReturnView state={state} />;
}
