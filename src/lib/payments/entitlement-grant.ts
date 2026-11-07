/**
 * What a confirmed one-off PayU payment does to entitlements.
 *
 * Rules (no card-on-file, no price proration):
 * - A month is +1 calendar month UTC; a year is +12. The day clamps
 *   (31 Jan + 1 month → 28/29 Feb). The clock time is kept.
 * - Same plan, still running with a finite expiry: extend from the later of
 *   now and the current expiry. A queued cheaper plan keeps its length and
 *   its start moves to the new end.
 * - Higher plan while a lower one is still running: the higher plan starts
 *   now. Time left on the lower plan is added, millisecond for millisecond,
 *   after the purchased period. A queued cheaper plan keeps its length and
 *   starts at the new end.
 * - Lower plan while a higher one is still running: the higher plan stays
 *   until it ends. The cheaper plan is queued from that instant for the
 *   purchased period. Buying that same cheaper plan again extends the queue.
 *   A different cheaper plan is refused while one is queued.
 * - Perpetual admin grant (active, expires_at null, paid tier): checkout is
 *   refused. A webhook does not replace it with a finite date.
 * - When the current plan has ended and a queue is still running, the queue
 *   becomes the current plan before the next decision.
 * - Expired or missing plan: the purchased plan starts now.
 * - Reference-mastering add-on is one month, sold on a live Silver plan.
 *   Gold already includes it. A perpetual add-on is not shortened.
 * - source on the row we write is `purchase`.
 */

import type { PaidTier, PlanPack } from "@/config/plan-policy";
import { PLAN_PACK_CATALOG, referenceMasteringForTier, youtubePackOffer, youtubeUnitsForGrosz } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

import type { BillingPeriod, CheckoutProduct } from "@/lib/payments/money";

const RANK: Record<PremiumTier, number> = { FREE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 };

export type PlanSnapshot = {
  tier: PremiumTier;
  active: boolean;
  expiresAt: string | null;
  /** Cheaper plan paid in advance. Starts when `expiresAt` is reached. */
  pendingTier?: PaidTier | null;
  pendingExpiresAt?: string | null;
} | null;

export type AddonSnapshot = { endsAt: string | null } | null;

export type CheckoutBlock = "PENDING_PLAN" | "PERPETUAL" | "ADDON_INCLUDED" | "ADDON_NEEDS_SILVER" | "ADDON_PERPETUAL" | "PACK_NEEDS_PAID";

export type PlanChangeKind = "buy" | "extend" | "upgrade" | "later" | "perpetual";

export type GrantWrite =
  | {
      action: "plan";
      tier: PaidTier;
      expiresAt: string;
      pendingTier: PaidTier | null;
      pendingExpiresAt: string | null;
      expectedPresent: boolean;
      expectedTier: PremiumTier | null;
      expectedActive: boolean | null;
      expectedExpiresAt: string | null;
      expectedPendingTier: PaidTier | null;
      expectedPendingExpiresAt: string | null;
    }
  | {
      action: "schedule";
      pendingTier: PaidTier;
      pendingExpiresAt: string;
      expectedPresent: true;
      expectedTier: PaidTier;
      expectedActive: true;
      expectedExpiresAt: string;
      expectedPendingTier: PaidTier | null;
      expectedPendingExpiresAt: string | null;
    }
  | {
      action: "addon";
      endsAt: string;
      expectedPresent: boolean;
      expectedEndsAt: string | null;
    }
  | { action: "pack"; pack: PlanPack; units: number }
  | { action: "skip"; note: "perpetual" | "downgrade" | "pending_plan" | "addon_perpetual" | "pack_amount" };

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

function isPaidTier(tier: PremiumTier | null | undefined): tier is PaidTier {
  return tier === "BRONZE" || tier === "SILVER" || tier === "GOLD";
}

export function isLivePaid(plan: PlanSnapshot, now: Date): plan is {
  tier: PaidTier;
  active: true;
  expiresAt: string | null;
  pendingTier?: PaidTier | null;
  pendingExpiresAt?: string | null;
} {
  if (!plan || plan.active !== true) return false;
  if (!isPaidTier(plan.tier)) return false;
  if (plan.expiresAt === null) return true;
  const expiry = Date.parse(plan.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

/** When the current plan has ended, a still-running queue becomes the current plan. */
export function withDuePlan(plan: PlanSnapshot, now: Date): PlanSnapshot {
  if (!plan?.active || !plan.expiresAt || !plan.pendingExpiresAt || !isPaidTier(plan.pendingTier)) return plan;
  const expiry = Date.parse(plan.expiresAt);
  const pendingEnd = Date.parse(plan.pendingExpiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(pendingEnd)) return plan;
  if (expiry > now.getTime()) return plan;
  if (pendingEnd <= now.getTime()) return { ...plan, pendingTier: null, pendingExpiresAt: null };
  return {
    ...plan,
    tier: plan.pendingTier,
    expiresAt: plan.pendingExpiresAt,
    pendingTier: null,
    pendingExpiresAt: null,
  };
}

function pendingFields(plan: PlanSnapshot): { pendingTier: PaidTier | null; pendingExpiresAt: string | null } {
  return {
    pendingTier: isPaidTier(plan?.pendingTier) ? plan.pendingTier : null,
    pendingExpiresAt: plan?.pendingExpiresAt ?? null,
  };
}

function shiftPending(plan: PlanSnapshot, nextExpiry: Date): { pendingTier: PaidTier | null; pendingExpiresAt: string | null } {
  if (!plan?.expiresAt || !plan.pendingExpiresAt || !isPaidTier(plan.pendingTier)) {
    return { pendingTier: null, pendingExpiresAt: null };
  }
  const start = Date.parse(plan.expiresAt);
  const end = Date.parse(plan.pendingExpiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { pendingTier: null, pendingExpiresAt: null };
  }
  return { pendingTier: plan.pendingTier, pendingExpiresAt: new Date(nextExpiry.getTime() + (end - start)).toISOString() };
}

export function planChangeKind(plan: PlanSnapshot, tier: PaidTier, now: Date): PlanChangeKind {
  const current = withDuePlan(plan, now);
  if (!isLivePaid(current, now)) return "buy";
  if (current.expiresAt === null) return "perpetual";
  if (current.tier === tier) return "extend";
  return RANK[current.tier] < RANK[tier] ? "upgrade" : "later";
}

export function planStartsLater(product: CheckoutProduct, plan: PlanSnapshot, now: Date): boolean {
  return product.kind === "plan" && planChangeKind(plan, product.tier, now) === "later";
}

function laterInstant(now: Date, iso: string | null): Date {
  if (!iso) return now;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return now;
  return new Date(Math.max(now.getTime(), parsed));
}

export function checkoutBlock(product: CheckoutProduct, plan: PlanSnapshot, addon: AddonSnapshot, now: Date): CheckoutBlock | null {
  const current = withDuePlan(plan, now);
  if (product.kind === "pack") {
    if (product.pack !== "youtube") return null;
    return isLivePaid(current, now) && youtubePackOffer(current.tier) ? null : "PACK_NEEDS_PAID";
  }
  if (product.kind === "addon") {
    const live = isLivePaid(current, now);
    const tier: PremiumTier = live ? current.tier : "FREE";
    const access = referenceMasteringForTier(tier);
    if (access === "included") return "ADDON_INCLUDED";
    if (access !== "addon") return "ADDON_NEEDS_SILVER";
    if (addon && addon.endsAt === null) return "ADDON_PERPETUAL";
    return null;
  }
  const live = isLivePaid(current, now);
  if (!live) return null;
  if (current.expiresAt === null) return "PERPETUAL";
  const queued = pendingFields(current);
  if (queued.pendingTier && queued.pendingTier !== product.tier && RANK[current.tier] > RANK[product.tier]) return "PENDING_PLAN";
  return null;
}

export function grantWrite(product: CheckoutProduct, plan: PlanSnapshot, addon: AddonSnapshot, now: Date, amountGrosz?: number): GrantWrite {
  if (product.kind === "pack") {
    if (product.pack === "youtube") {
      const units = youtubeUnitsForGrosz(amountGrosz ?? 0);
      if (!units) return { action: "skip", note: "pack_amount" };
      return { action: "pack", pack: "youtube", units };
    }
    return { action: "pack", pack: product.pack, units: PLAN_PACK_CATALOG[product.pack].units };
  }
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

  const current = withDuePlan(plan, now);
  const live = isLivePaid(current, now);
  if (live && current.expiresAt === null) return { action: "skip", note: "perpetual" };

  const queued = pendingFields(current);
  const expected = {
    expectedPresent: current !== null && current.active === true,
    expectedTier: current?.tier ?? null,
    expectedActive: current ? current.active : null,
    expectedExpiresAt: current?.expiresAt ?? null,
    expectedPendingTier: queued.pendingTier,
    expectedPendingExpiresAt: queued.pendingExpiresAt,
  };

  if (live && current.expiresAt && RANK[current.tier] > RANK[product.tier]) {
    if (queued.pendingTier && queued.pendingTier !== product.tier) return { action: "skip", note: "pending_plan" };
    const base = queued.pendingTier === product.tier && queued.pendingExpiresAt
      ? new Date(queued.pendingExpiresAt)
      : new Date(current.expiresAt);
    return {
      action: "schedule",
      pendingTier: product.tier,
      pendingExpiresAt: addBillingPeriod(base, product.period).toISOString(),
      expectedPresent: true,
      expectedTier: current.tier,
      expectedActive: true,
      expectedExpiresAt: current.expiresAt,
      expectedPendingTier: queued.pendingTier,
      expectedPendingExpiresAt: queued.pendingExpiresAt,
    };
  }

  const upgraded = live && current.expiresAt && RANK[product.tier] > RANK[current.tier];
  const base = live && current.tier === product.tier ? laterInstant(now, current.expiresAt) : now;
  const periodEnd = addBillingPeriod(base, product.period);
  const leftoverMs = upgraded && current?.expiresAt ? Math.max(0, Date.parse(current.expiresAt) - now.getTime()) : 0;
  const expiresAt = new Date(periodEnd.getTime() + (Number.isFinite(leftoverMs) ? leftoverMs : 0));
  const pending = shiftPending(current, expiresAt);
  return {
    action: "plan",
    tier: product.tier,
    expiresAt: expiresAt.toISOString(),
    pendingTier: pending.pendingTier,
    pendingExpiresAt: pending.pendingExpiresAt,
    ...expected,
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
  if (write.action === "skip" || write.action === "pack") return { plan, addon };
  if (write.action === "schedule") {
    return {
      plan: plan
        ? { ...plan, pendingTier: write.pendingTier, pendingExpiresAt: write.pendingExpiresAt }
        : plan,
      addon,
    };
  }
  if (write.action === "plan") {
    return {
      plan: {
        tier: write.tier,
        active: true,
        expiresAt: write.expiresAt,
        pendingTier: write.pendingTier,
        pendingExpiresAt: write.pendingExpiresAt,
      },
      addon,
    };
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

  const write = grantWrite(order.product, input.plan, input.addon, input.now, order.amountGrosz);
  const next = applyWrite(input.plan, input.addon, write);
  if (write.action === "skip") {
    return { kind: "skipped", write, nextPlan: next.plan, nextAddon: next.addon };
  }
  return { kind: "granted", write, nextPlan: next.plan, nextAddon: next.addon };
}
