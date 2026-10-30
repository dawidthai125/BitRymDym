import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { readPlanPaymentsAvailable, type PaidTier } from "@/config/plan-policy";
import { PRIVACY_VERSION, TERMS_VERSION, purchaseConsentValid, type PurchaseConsentInput } from "@/lib/legal/legal-config";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { checkoutBlock, type AddonSnapshot, type CheckoutBlock, type PlanSnapshot } from "@/lib/payments/entitlement-grant";
import { parseCheckoutProduct, priceGrosz, type CheckoutProduct } from "@/lib/payments/money";
import { registerP24Transaction } from "@/lib/payments/p24-client";
import { readP24Config } from "@/lib/payments/p24-config";
import { loadAddonSnapshot, loadPlanSnapshot } from "@/lib/payments/snapshots";

export type CheckoutCode =
  | "PAYMENTS_OFF"
  | "CONSENT"
  | "EMAIL"
  | "INVALID"
  | "RATE"
  | "PROVIDER"
  | CheckoutBlock;

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; code: CheckoutCode };

const HOUR_MS = 60 * 60 * 1000;
const PENDING_LIMIT = 5;

export function p24Description(product: CheckoutProduct, locale: "pl" | "en"): string {
  if (product.kind === "addon") {
    return locale === "en"
      ? "BitRymDym reference mastering, 1 month"
      : "BitRymDym mastering z referencją, 1 miesiąc";
  }
  const period = product.period === "year" ? (locale === "en" ? "1 year" : "1 rok") : locale === "en" ? "1 month" : "1 miesiąc";
  return `BitRymDym ${product.tier}, ${period}`;
}

export function parsePurchaseConsent(input: unknown): PurchaseConsentInput | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row.acceptTerms !== "boolean" || typeof row.immediatePerformance !== "boolean") return null;
  return { acceptTerms: row.acceptTerms, immediatePerformance: row.immediatePerformance };
}

export function tierBlocks(plan: PlanSnapshot, addon: AddonSnapshot, now: Date): Record<PaidTier, CheckoutBlock | null> {
  return {
    BRONZE: checkoutBlock({ kind: "plan", tier: "BRONZE", period: "month" }, plan, addon, now),
    SILVER: checkoutBlock({ kind: "plan", tier: "SILVER", period: "month" }, plan, addon, now),
    GOLD: checkoutBlock({ kind: "plan", tier: "GOLD", period: "month" }, plan, addon, now),
  };
}

export async function startCheckout(input: {
  context: AuthContext;
  body: unknown;
  locale: "pl" | "en";
  now?: Date;
}): Promise<CheckoutResult> {
  const config = readP24Config();
  if (!readPlanPaymentsAvailable() || !config) return { ok: false, code: "PAYMENTS_OFF" };

  const row = input.body && typeof input.body === "object" ? (input.body as Record<string, unknown>) : null;
  const product = parseCheckoutProduct(row?.product);
  if (!product) return { ok: false, code: "INVALID" };
  const consent = parsePurchaseConsent(row?.consent);
  if (!consent || !purchaseConsentValid(consent)) return { ok: false, code: "CONSENT" };

  const email = input.context.email?.trim() ?? "";
  if (!email.includes("@") || email.length > 320) return { ok: false, code: "EMAIL" };

  const now = input.now ?? new Date();
  const [plan, addon] = await Promise.all([
    loadPlanSnapshot(input.context.userId),
    loadAddonSnapshot(input.context.userId),
  ]);
  const block = checkoutBlock(product, plan, addon, now);
  if (block) return { ok: false, code: block };

  const amountGrosz = priceGrosz(product);
  const admin = createSupabaseAdminClient();
  const since = new Date(now.getTime() - HOUR_MS).toISOString();
  const pending = await admin
    .from("payment_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.context.userId)
    .eq("status", "pending")
    .gte("created_at", since);
  if (pending.error) return { ok: false, code: "PROVIDER" };
  if ((pending.count ?? 0) >= PENDING_LIMIT) return { ok: false, code: "RATE" };

  const sessionId = crypto.randomUUID();
  const origin = getSiteUrl();
  const inserted = await admin.from("payment_orders").insert({
    user_id: input.context.userId,
    session_id: sessionId,
    product_kind: product.kind,
    plan_tier: product.kind === "plan" ? product.tier : null,
    addon: product.kind === "addon" ? product.addon : null,
    period: product.period,
    amount_grosz: amountGrosz,
    currency: "PLN",
    buyer_email: email,
    locale: input.locale,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    terms_accepted_at: now.toISOString(),
    immediate_performance: true,
  }).select("id").maybeSingle();
  if (inserted.error || !inserted.data) return { ok: false, code: "PROVIDER" };

  const registered = await registerP24Transaction(config, {
    sessionId,
    amountGrosz,
    description: p24Description(product, input.locale),
    email,
    language: input.locale,
    urlReturn: `${origin}/premium/return/${sessionId}`,
    urlStatus: `${origin}/api/webhooks/p24`,
  });
  if ("error" in registered) {
    await admin.from("payment_orders").update({ status: "failed" }).eq("session_id", sessionId).eq("status", "pending");
    return { ok: false, code: "PROVIDER" };
  }
  return { ok: true, redirectUrl: registered.redirectUrl };
}
