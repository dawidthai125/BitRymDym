/**
 * What a confirmed one-off P24 payment does to entitlements.
 *
 * Rules (no card-on-file, no proration):
 * - A month is +1 calendar month UTC; a year is +12. The day clamps
 *   (31 Jan + 1 month → 28/29 Feb). The clock time is kept.
 * - Same plan, still running with a finite expiry: extend from the later of
 *   now and the current expiry.
 * - Higher plan while a lower one is still running: the higher plan starts
 *   now. Days left on the lower plan are not credited.
 * - Lower plan while a higher one is still running: checkout is refused.
 *   If the webhook arrives anyway (admin upgraded in between), the payment
 *   is recorded and the higher plan is left untouched.
 * - Perpetual admin grant (active, expires_at null, paid tier): checkout is
 *   refused. A webhook does not replace it with a finite date.
 * - Expired or missing plan: the purchased plan starts now.
 * - Reference-mastering add-on is one month, sold on a live Silver plan.
 *   Gold already includes it. A perpetual add-on is not shortened.
 * - source on the row we write is `purchase`.
 */

import type { PaidTier } from "@/config/plan-policy";
import { referenceMasteringForTier } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

import type { BillingPeriod, CheckoutProduct } from "@/lib/payments/money";

const RANK: Record<PremiumTier, number> = { FREE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 };

export type PlanSnapshot = {
  tier: PremiumTier;
  active: boolean;
  expiresAt: string | null;
} | null;

export type AddonSnapshot = { endsAt: string | null } | null;

export type CheckoutBlock = "DOWNGRADE" | "PERPETUAL" | "ADDON_INCLUDED" | "ADDON_NEEDS_SILVER" | "ADDON_PERPETUAL";

export type GrantWrite =
  | {
      action: "plan";
      tier: PaidTier;
      expiresAt: string;
      expectedPresent: boolean;
      expectedTier: PremiumTier | null;
      expectedActive: boolean | null;
      expectedExpiresAt: string | null;
    }
  | {
      action: "addon";
      endsAt: string;
      expectedPresent: boolean;
      expectedEndsAt: string | null;
    }
  | { action: "skip"; note: "perpetual" | "downgrade" | "addon_perpetual" };

export function addBillingPeriod(from: Date, period: BillingPeriod): Date {
  const months = period === "year" ? 12 : 1;
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const hours = from.getUTCHours();
  const minutes = from.getUTCMinutes();
  const seconds = from.getUTCSeconds();
  const ms = from.getUTCMilliseconds();
  const cursor = new Date(Date.UTC(year, month + months, 1, hours, minutes, seconds, ms));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(day, lastDay), hours, minutes, seconds, ms));
}

export function isLivePaid(plan: PlanSnapshot, now: Date): plan is { tier: PaidTier; active: true; expiresAt: string | null } {
  if (!plan || plan.active !== true) return false;
  if (plan.tier !== "BRONZE" && plan.tier !== "SILVER" && plan.tier !== "GOLD") return false;
  if (plan.expiresAt === null) return true;
  const expiry = Date.parse(plan.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

function laterInstant(now: Date, iso: string | null): Date {
  if (!iso) return now;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return now;
  return new Date(Math.max(now.getTime(), parsed));
}

export function checkoutBlock(product: CheckoutProduct, plan: PlanSnapshot, addon: AddonSnapshot, now: Date): CheckoutBlock | null {
  if (product.kind === "addon") {
    const live = isLivePaid(plan, now);
    const tier: PremiumTier = live ? plan.tier : "FREE";
    const access = referenceMasteringForTier(tier);
    if (access === "included") return "ADDON_INCLUDED";
    if (access !== "addon") return "ADDON_NEEDS_SILVER";
    if (addon && addon.endsAt === null) return "ADDON_PERPETUAL";
    return null;
  }
  const live = isLivePaid(plan, now);
  if (!live) return null;
  if (plan.expiresAt === null) return "PERPETUAL";
  if (RANK[plan.tier] > RANK[product.tier]) return "DOWNGRADE";
  return null;
}

export function grantWrite(product: CheckoutProduct, plan: PlanSnapshot, addon: AddonSnapshot, now: Date): GrantWrite {
  if (product.kind === "addon") {
    if (addon && addon.endsAt === null) return { action: "skip", note: "addon_perpetual" };
    const base = addon ? laterInstant(now, addon.endsAt) : now;
    return {
      action: "addon",
      endsAt: addBillingPeriod(base, "month").toISOString(),
      expectedPresent: addon !== null,
      expectedEndsAt: addon?.endsAt ?? null,
    };
  }

  const live = isLivePaid(plan, now);
  if (live && plan.expiresAt === null) return { action: "skip", note: "perpetual" };
  if (live && RANK[plan.tier] > RANK[product.tier]) return { action: "skip", note: "downgrade" };

  const base = live && plan.tier === product.tier ? laterInstant(now, plan.expiresAt) : now;
  return {
    action: "plan",
    tier: product.tier,
    expiresAt: addBillingPeriod(base, product.period).toISOString(),
    expectedPresent: plan !== null && plan.active === true,
    expectedTier: plan?.tier ?? null,
    expectedActive: plan ? plan.active : null,
    expectedExpiresAt: plan?.expiresAt ?? null,
  };
}

export type OrderLedger = {
  status: "pending" | "paid" | "failed";
  grantStatus: "pending" | "granted" | "skipped";
  amountGrosz: number;
  currency: string;
  product: CheckoutProduct;
};

export type SettleNotification = {
  amountGrosz: number;
  currency: string;
  merchantId: number;
  posId: number;
};

export type SettleResult =
  | { kind: "already" }
  | { kind: "rejected"; code: "amount" | "currency" | "merchant" | "pos" | "state" }
  | { kind: "granted" | "skipped"; write: GrantWrite; nextPlan: PlanSnapshot; nextAddon: AddonSnapshot };

function applyWrite(plan: PlanSnapshot, addon: AddonSnapshot, write: GrantWrite): { plan: PlanSnapshot; addon: AddonSnapshot } {
  if (write.action === "skip") return { plan, addon };
  if (write.action === "plan") {
    return { plan: { tier: write.tier, active: true, expiresAt: write.expiresAt }, addon };
  }
  return { plan, addon: { endsAt: write.endsAt } };
}

/**
 * Pure settlement. A second call on the updated ledger returns `already`
 * and does not move the expiry again.
 */
export function settleVerifiedNotification(input: {
  order: OrderLedger;
  notification: SettleNotification;
  merchantId: number;
  posId: number;
  plan: PlanSnapshot;
  addon: AddonSnapshot;
  now: Date;
}): SettleResult {
  const { order, notification } = input;
  if (order.status === "paid" && (order.grantStatus === "granted" || order.grantStatus === "skipped")) {
    return { kind: "already" };
  }
  if (order.status !== "pending" || order.grantStatus !== "pending") {
    return { kind: "rejected", code: "state" };
  }
  if (notification.merchantId !== input.merchantId) return { kind: "rejected", code: "merchant" };
  if (notification.posId !== input.posId) return { kind: "rejected", code: "pos" };
  if (notification.currency !== "PLN" || order.currency !== "PLN") return { kind: "rejected", code: "currency" };
  if (notification.amountGrosz !== order.amountGrosz) return { kind: "rejected", code: "amount" };

  const write = grantWrite(order.product, input.plan, input.addon, input.now);
  const next = applyWrite(input.plan, input.addon, write);
  if (write.action === "skip") {
    return { kind: "skipped", write, nextPlan: next.plan, nextAddon: next.addon };
  }
  return { kind: "granted", write, nextPlan: next.plan, nextAddon: next.addon };
}
