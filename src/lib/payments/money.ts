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
  youtubePackOffer,
  type PaidTier,
  type PlanAddon,
  type PlanPack,
} from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

export type BillingPeriod = "month" | "year";

export type CheckoutProduct =
  | { kind: "plan"; tier: PaidTier; period: BillingPeriod }
  | { kind: "addon"; addon: PlanAddon; period: "month" }
  | { kind: "pack"; pack: PlanPack };

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
  return null;
}
