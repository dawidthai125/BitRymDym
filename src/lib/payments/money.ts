/**
 * Gross PLN prices → grosz (1/100 PLN). Server catalog only.
 * The checkout body has no amount field; callers must use these functions.
 */

import {
  isPlanPack,
  PAID_TIERS,
  PLAN_ADDON_PRICE_PLN,
  PLAN_PACK_CATALOG,
  PLAN_POLICY,
  STARTER_PACK_OFFER,
  starterPackGrosz,
  youtubePackOffer,
  type PaidTier,
  type PlanAddon,
  type PlanPack,
  type PromoCode,
} from "@/config/plan-policy";
import { isUuid } from "@/lib/beats/audio-validation";
import type { PremiumTier } from "@/types/premium";

export type BillingPeriod = "month" | "year";

/** Paid-catalog wav. Server price only. 19.99 * 100 is not an integer; plnToGrosz rounds to 1999. */
export const BEAT_WAV_PRICE_PLN = 19.99;

export type CheckoutProduct =
  | { kind: "plan"; tier: PaidTier; period: BillingPeriod }
  | { kind: "addon"; addon: PlanAddon; period: "month" }
  | { kind: "pack"; pack: PlanPack }
  | { kind: "beat"; beatId: string };

export function formatBeatWavPrice(locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(BEAT_WAV_PRICE_PLN);
}

/** IEEE-safe: 14.99 * 100 is not an integer, Math.round yields 1499. */
export function plnToGrosz(pln: number): number {
  if (!Number.isFinite(pln) || pln <= 0) {
    throw new Error("PRICE_INVALID");
  }
  const grosz = Math.round(pln * 100);
  if (!Number.isSafeInteger(grosz) || grosz <= 0) {
    throw new Error("PRICE_INVALID");
  }
  return grosz;
}

export function priceGrosz(product: CheckoutProduct, buyerTier?: PremiumTier | null): number {
  if (product.kind === "beat") {
    return plnToGrosz(BEAT_WAV_PRICE_PLN);
  }
  if (product.kind === "pack") {
    if (product.pack === "youtube") {
      const offer = youtubePackOffer(buyerTier ?? null);
      if (!offer) throw new Error("PRICE_INVALID");
      return plnToGrosz(offer.pricePln);
    }
    return plnToGrosz(PLAN_PACK_CATALOG[product.pack].pricePln);
  }
  if (product.kind === "addon") {
    if (product.period !== "month" || product.addon !== "reference_mastering") {
      throw new Error("PRICE_INVALID");
    }
    return plnToGrosz(PLAN_ADDON_PRICE_PLN.reference_mastering.monthlyPln);
  }
  const price = PLAN_POLICY[product.tier].price;
  const pln = product.period === "month" ? price.monthlyPln : price.yearlyPln;
  if (pln == null) throw new Error("PRICE_INVALID");
  return plnToGrosz(pln);
}

export type CheckoutPrice = {
  /** What PayU charges and what payment_orders.amount_grosz stores. */
  amountGrosz: number;
  /** Catalog price before the discount; null without a discount. */
  regularAmountGrosz: number | null;
  promoCode: PromoCode | null;
};

/**
 * Server price for a checkout. `starter` = the account qualifies (starter-offer.ts).
 * The discount applies to packs only; plans, add-ons and beats ignore it.
 */
export function checkoutPrice(product: CheckoutProduct, buyerTier: PremiumTier | null | undefined, starter: boolean): CheckoutPrice {
  const regular = priceGrosz(product, buyerTier);
  if (!starter || product.kind !== "pack") return { amountGrosz: regular, regularAmountGrosz: null, promoCode: null };
  return { amountGrosz: starterPackGrosz(regular), regularAmountGrosz: regular, promoCode: STARTER_PACK_OFFER.code };
}

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === "string" && (PAID_TIERS as readonly string[]).includes(value);
}

/** Ignores any client-supplied amount, currency or price. */
export function parseCheckoutProduct(input: unknown): CheckoutProduct | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (row.kind === "plan" && isPaidTier(row.tier) && (row.period === "month" || row.period === "year")) {
    return { kind: "plan", tier: row.tier, period: row.period };
  }
  if (row.kind === "addon" && row.addon === "reference_mastering") {
    return { kind: "addon", addon: "reference_mastering", period: "month" };
  }
  if (row.kind === "pack" && isPlanPack(row.pack)) {
    return { kind: "pack", pack: row.pack };
  }
  if (row.kind === "beat" && isUuid(row.beatId)) {
    return { kind: "beat", beatId: row.beatId };
  }
  return null;
}

/** Rebuilds the product from a payment_orders row. A beat row without a uuid is refused. */
export function checkoutProductFromOrderRow(row: {
  product_kind: string;
  plan_tier: string | null;
  addon: string | null;
  pack: string | null;
  period: string;
  beat_id?: string | null;
}): CheckoutProduct | null {
  if (row.product_kind === "beat") {
    return parseCheckoutProduct({ kind: "beat", beatId: row.beat_id });
  }
  if (row.product_kind === "plan") {
    return parseCheckoutProduct({ kind: "plan", tier: row.plan_tier, period: row.period });
  }
  if (row.product_kind === "pack") {
    return parseCheckoutProduct({ kind: "pack", pack: row.pack });
  }
  return parseCheckoutProduct({ kind: "addon", addon: row.addon, period: row.period });
}
