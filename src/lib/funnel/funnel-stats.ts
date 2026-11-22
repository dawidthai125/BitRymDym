/**
 * Funnel numbers for /admin/lejek. Read-only, ADMIN with payments.view
 * (same guard as /admin/platnosci).
 */

import "server-only";

import type { PaymentHistoryOrderInput } from "@/lib/admin/payment-history-present";
import { requireAdminPaymentHistoryAccess } from "@/lib/admin/payment-history";
import {
  FUNNEL_PAID_STATUSES,
  funnelSince,
  funnelSteps,
  paidBreakdown,
  type FunnelStep,
  type PaidBreakdownRow,
} from "@/lib/funnel/funnel-math";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const FUNNEL_WINDOWS = [7, 30] as const;
const PAID_ROWS_CAP = 10000;

export type FunnelWindowStats = { days: number; steps: FunnelStep[]; breakdown: PaidBreakdownRow[] };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function countEvents(admin: Admin, event: "premium_view" | "buy_click", since: string): Promise<number> {
  const res = await admin
    .from("funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("event", event)
    .gte("created_at", since);
  if (res.error) throw new Error("funnel_events_load_failed");
  return res.count ?? 0;
}

async function countOrders(admin: Admin, since: string): Promise<number> {
  const res = await admin
    .from("payment_orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (res.error) throw new Error("funnel_orders_load_failed");
  return res.count ?? 0;
}

type PaidRow = PaymentHistoryOrderInput & { created_at: string };

async function loadPaid(admin: Admin, since: string): Promise<PaidRow[]> {
  const res = await admin
    .from("payment_orders")
    .select("created_at, product_kind, plan_tier, addon, pack, period, amount_grosz, status, grant_status")
    .in("status", [...FUNNEL_PAID_STATUSES])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(PAID_ROWS_CAP);
  if (res.error) throw new Error("funnel_paid_load_failed");
  return (res.data ?? []).filter(
    (row): row is PaidRow => !!row && typeof (row as { created_at?: unknown }).created_at === "string",
  );
}

export async function loadFunnelStats(now: Date = new Date()): Promise<FunnelWindowStats[]> {
  await requireAdminPaymentHistoryAccess();
  const admin = createSupabaseAdminClient();
  const longest = Math.max(...FUNNEL_WINDOWS);
  const paidAll = await loadPaid(admin, funnelSince(longest, now));
  return Promise.all(
    FUNNEL_WINDOWS.map(async (days) => {
      const since = funnelSince(days, now);
      const sinceMs = Date.parse(since);
      const [views, clicks, started] = await Promise.all([
        countEvents(admin, "premium_view", since),
        countEvents(admin, "buy_click", since),
        countOrders(admin, since),
      ]);
      const paid = paidAll.filter((row) => Date.parse(row.created_at) >= sinceMs);
      return {
        days,
        steps: funnelSteps({ views, clicks, started, paid: paid.length }),
        breakdown: paidBreakdown(paid),
      };
    }),
  );
}
