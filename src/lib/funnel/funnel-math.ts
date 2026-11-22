/**
 * Pure purchase-funnel math for /admin/lejek. No database access.
 */

import {
  paymentHistoryProduct,
  type PaymentHistoryOrderInput,
  type PaymentHistoryProduct,
} from "@/lib/admin/payment-history-present";

export type FunnelCounts = { views: number; clicks: number; started: number; paid: number };
export type FunnelStepId = keyof FunnelCounts;
export type FunnelStep = {
  id: FunnelStepId;
  count: number;
  /** Percent of the previous step (one decimal); null for the first step or a zero previous step. */
  fromPrevious: number | null;
  /** Percent of views (one decimal); null when there were no views. */
  fromViews: number | null;
};

const ORDER: FunnelStepId[] = ["views", "clicks", "started", "paid"];

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function conversionPercent(part: number, whole: number): number | null {
  const p = safeCount(part);
  const w = safeCount(whole);
  if (w === 0) return null;
  return Math.round((p / w) * 1000) / 10;
}

export function funnelSteps(counts: FunnelCounts): FunnelStep[] {
  const views = safeCount(counts.views);
  return ORDER.map((id, index) => {
    const count = safeCount(counts[id]);
    const previous = index === 0 ? null : safeCount(counts[ORDER[index - 1]!]);
    return {
      id,
      count,
      fromPrevious: previous === null ? null : conversionPercent(count, previous),
      fromViews: index === 0 ? null : conversionPercent(count, views),
    };
  });
}

export type PaidBreakdownRow = { key: string; product: PaymentHistoryProduct; count: number };

function productKey(product: PaymentHistoryProduct): string {
  if (product.kind === "plan") return `plan:${product.tier}`;
  if (product.kind === "pack") return `pack:${product.pack}`;
  return product.kind;
}

/** Paid orders grouped by product, most first (ties by key for a stable order). */
export function paidBreakdown(orders: PaymentHistoryOrderInput[]): PaidBreakdownRow[] {
  const rows = new Map<string, PaidBreakdownRow>();
  for (const order of orders) {
    const product = paymentHistoryProduct(order);
    const key = productKey(product);
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { key, product, count: 1 });
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export const FUNNEL_PAID_STATUSES = ["paid", "refunded"] as const;

export function funnelSince(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
