import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { PAYMENT_PENDING_ORDER_LIMITS, PLAN_PACK_CATALOG, readPlanPaymentsAvailable, type PaidTier } from "@/config/plan-policy";
import { PRIVACY_VERSION, TERMS_VERSION, purchaseConsentCovers, type PurchaseConsentInput } from "@/lib/legal/legal-config";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction } from "@/lib/supabase/rpc-errors";

import { loadBeatSale } from "@/lib/payments/beat-sale";
import { checkoutBlock, isLivePaid, planStartsLater, type AddonSnapshot, type CheckoutBlock, type PlanSnapshot } from "@/lib/payments/entitlement-grant";
import { checkoutPrice, parseCheckoutProduct, type CheckoutProduct } from "@/lib/payments/money";
import { registerP24Transaction } from "@/lib/payments/p24-client";
import { readP24Config } from "@/lib/payments/p24-config";
import { registerPayuOrder } from "@/lib/payments/payu-client";
import { readPayuConfig } from "@/lib/payments/payu-config";
import { isCustomerIp } from "@/lib/payments/payu-url";
import { loadAddonSnapshot, loadPlanSnapshot } from "@/lib/payments/snapshots";
import { loadStarterOffer } from "@/lib/payments/starter-offer";

export type CheckoutCode =
  | "PAYMENTS_OFF"
  | "CONSENT"
  | "EMAIL"
  | "INVALID"
  | "RATE"
  | "PROVIDER"
  | "OWNED"
  | "OPEN"
  | "PROMO"
  | CheckoutBlock;

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; code: CheckoutCode };

const HOUR_MS = 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Insert the pending order under the unfinished-checkout cap (PAYMENT_PENDING_ORDER_LIMITS) atomically
 * via create_payment_order_capped. Before migration 20261121150100 is applied: previous count + insert.
 * A discounted order (promo_code) also needs the one-per-account check inside the same RPC
 * (migration 20261122120000): "PROMO" when another discounted order is pending / paid / refunded.
 */
export async function createPendingOrder(
  admin: AdminClient,
  order: Record<string, unknown> & { user_id: string },
  now: Date,
): Promise<"ok" | "RATE" | "PROVIDER" | "PROMO"> {
  const { perHour, perDay } = PAYMENT_PENDING_ORDER_LIMITS;
  const claimed = await admin.rpc("create_payment_order_capped", {
    p_user: order.user_id,
    p_order: order,
    p_max_hour: perHour,
    p_max_day: perDay,
  });
  if (!isMissingRpcFunction(claimed.error)) {
    if (claimed.error) return "PROVIDER";
    const row = (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data) as { status?: string; order_id?: string } | null;
    if (row?.status === "ok" && row.order_id) return "ok";
    if (row?.status === "rate_hour" || row?.status === "rate_day") return "RATE";
    if (row?.status === "promo_used") return "PROMO";
    return "PROVIDER";
  }
  // Without the RPC there is no atomic one-per-account guard: never insert a discounted order.
  if (order.promo_code != null) return "PROMO";
  const pending = await admin
    .from("payment_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", order.user_id)
    .eq("status", "pending")
    .gte("created_at", new Date(now.getTime() - HOUR_MS).toISOString());
  if (pending.error) return "PROVIDER";
  if ((pending.count ?? 0) >= perHour) return "RATE";
  const inserted = await admin.from("payment_orders").insert(order).select("id").maybeSingle();
  return inserted.error || !inserted.data ? "PROVIDER" : "ok";
}

export function p24Description(product: CheckoutProduct, locale: "pl" | "en", beatTitle?: string): string {
  if (product.kind === "beat") {
    const title = (beatTitle ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const base = locale === "en" ? "BitRymDym beat, wav file" : "BitRymDym bit, plik wav";
    return title ? `${base}: ${title}` : base;
  }
  if (product.kind === "pack") {
    if (product.pack === "youtube") {
      return locale === "en" ? "BitRymDym pack, YouTube MP4" : "BitRymDym pakiet, wideo MP4 pod YouTube";
    }
    const units = PLAN_PACK_CATALOG[product.pack].units;
    if (product.pack === "take") {
      return locale === "en" ? `BitRymDym pack, ${units} extra recordings` : `BitRymDym pakiet, ${units} dodatkowych nagrań`;
    }
    return locale === "en" ? `BitRymDym pack, ${units} extra masters` : `BitRymDym pakiet, ${units} dodatkowych masterów`;
  }
  if (product.kind === "addon") {
    return locale === "en"
      ? "BitRymDym reference mastering, 1 month"
      : "BitRymDym mastering pod wybrany utwór, 1 miesiąc";
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
  customerIp?: string;
  now?: Date;
}): Promise<CheckoutResult> {
  const payu = readPayuConfig();
  const config = payu ? null : readP24Config();
  if (!readPlanPaymentsAvailable() || (!payu && !config)) return { ok: false, code: "PAYMENTS_OFF" };
  if (payu && !isCustomerIp(input.customerIp ?? "")) return { ok: false, code: "PROVIDER" };

  const row = input.body && typeof input.body === "object" ? (input.body as Record<string, unknown>) : null;
  const product = parseCheckoutProduct(row?.product);
  if (!product) return { ok: false, code: "INVALID" };
  const consent = parsePurchaseConsent(row?.consent);

  const email = input.context.email?.trim() ?? "";
  if (!email.includes("@") || email.length > 320) return { ok: false, code: "EMAIL" };

  const now = input.now ?? new Date();
  const [plan, addon] = await Promise.all([
    loadPlanSnapshot(input.context.userId),
    loadAddonSnapshot(input.context.userId),
  ]);
  if (!consent || !purchaseConsentCovers(consent, planStartsLater(product, plan, now))) return { ok: false, code: "CONSENT" };
  const block = checkoutBlock(product, plan, addon, now);
  if (block) return { ok: false, code: block };

  let beatTitle = "";
  if (product.kind === "beat") {
    const sale = await loadBeatSale(product.beatId, input.context.userId, now);
    if (!sale?.fileReady) return { ok: false, code: "INVALID" };
    if (sale.owned) return { ok: false, code: "OWNED" };
    if (sale.open) return { ok: false, code: "OPEN" };
    beatTitle = sale.title;
  }

  const buyerTier = isLivePaid(plan, now) ? plan.tier : "FREE";
  // Starter offer (-30% on one pack, 48 h from signup): qualified on the server only. `starter: true`
  // from the page only means "I was shown the discount": without it the discount still applies,
  // with it a lapsed offer is refused instead of silently charging the regular price.
  const starter = product.kind === "pack" ? await loadStarterOffer(input.context.userId, now) : null;
  if (product.kind === "pack" && row?.starter === true && !starter) return { ok: false, code: "PROMO" };
  const price = checkoutPrice(product, buyerTier, starter !== null);
  const amountGrosz = price.amountGrosz;
  const admin = createSupabaseAdminClient();
  const sessionId = crypto.randomUUID();
  const origin = getPublicSiteUrl();
  const order = {
    user_id: input.context.userId,
    session_id: sessionId,
    provider: payu ? "payu" : "p24",
    product_kind: product.kind,
    plan_tier: product.kind === "plan" ? product.tier : null,
    addon: product.kind === "addon" ? product.addon : null,
    ...(product.kind === "beat"
      ? { beat_id: product.beatId, pack: null, period: "once" }
      : product.kind === "pack"
        ? { pack: product.pack, period: "once" }
        : { period: product.period }),
    amount_grosz: amountGrosz,
    // Only on discounted orders, so a regular order never names a column the migration has not added yet.
    ...(price.promoCode ? { promo_code: price.promoCode, regular_amount_grosz: price.regularAmountGrosz } : {}),
    currency: "PLN",
    buyer_email: email,
    locale: input.locale,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    terms_accepted_at: now.toISOString(),
    immediate_performance: true,
  };
  const created = await createPendingOrder(admin, order, now);
  if (created !== "ok") return { ok: false, code: created };

  const description = p24Description(product, input.locale, beatTitle);
  const registered = payu
    ? await registerPayuOrder(payu, {
        sessionId,
        amountGrosz,
        description,
        email,
        language: input.locale,
        customerIp: input.customerIp ?? "",
        continueUrl: `${origin}/premium/return/${sessionId}`,
        notifyUrl: `${origin}/api/webhooks/payu`,
      })
    : await registerP24Transaction(config!, {
        sessionId,
        amountGrosz,
        description,
        email,
        language: input.locale,
        urlReturn: `${origin}/premium/return/${sessionId}`,
        urlStatus: `${origin}/api/webhooks/p24`,
      });
  if ("error" in registered) {
    await admin.from("payment_orders").update({ status: "failed" }).eq("session_id", sessionId).eq("status", "pending");
    return { ok: false, code: "PROVIDER" };
  }
  if ("orderId" in registered && registered.orderId) {
    // 2026-11-22: kept so the return page can ask PayU when the notification is lost.
    const stored = await admin.from("payment_orders").update({ provider_order_id: registered.orderId }).eq("session_id", sessionId);
    if (stored.error) console.error("[payu] provider order id not stored", { sessionId });
  }
  return { ok: true, redirectUrl: registered.redirectUrl };
}
