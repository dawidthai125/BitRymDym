/**
 * Admin purchase history. Read-only. Administrator with payments.view only.
 */

import "server-only";

import { hasPermission, hasRole } from "@/lib/auth/permissions";
import { AuthError, requireUser } from "@/lib/auth/session";
import {
  ADMIN_PAYMENTS_PAGE_SIZE,
  type PaymentHistoryOrderInput,
} from "@/lib/admin/payment-history-present";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ORDER_SELECT =
  "id, user_id, created_at, paid_at, buyer_email, product_kind, plan_tier, addon, pack, period, amount_grosz, currency, status, grant_status, granted_until" as const;

export type AdminPaymentHistoryRow = PaymentHistoryOrderInput & {
  id: string;
  userId: string;
  createdAt: string;
  paidAt: string | null;
  buyerEmail: string;
  currency: string;
  grantedUntil: string | null;
  displayName: string | null;
  userNumber: number | null;
};

export type AdminPaymentHistoryResult = {
  rows: AdminPaymentHistoryRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function requireAdminPaymentHistoryAccess() {
  const context = await requireUser();
  if (
    !hasRole(context.profile.role, ["ADMIN"]) ||
    !hasPermission(context.permissions, "payments.view")
  ) {
    throw new AuthError("FORBIDDEN", "Insufficient role.");
  }
  return context;
}

export function adminPaymentHistoryAccessDenial(
  error: unknown,
): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  if (!(error instanceof AuthError)) return null;
  if (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN") return error.code;
  return null;
}

type OrderRecord = {
  id: string;
  user_id: string;
  created_at: string;
  paid_at: string | null;
  buyer_email: string;
  product_kind: string | null;
  plan_tier: string | null;
  addon: string | null;
  pack: string | null;
  period: string | null;
  amount_grosz: number | null;
  currency: string | null;
  status: string | null;
  grant_status: string | null;
  granted_until: string | null;
};

function asOrder(value: unknown): OrderRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<OrderRecord>;
  if (typeof row.id !== "string" || typeof row.user_id !== "string") return null;
  if (typeof row.created_at !== "string" || typeof row.buyer_email !== "string") return null;
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
    buyer_email: row.buyer_email,
    product_kind: typeof row.product_kind === "string" ? row.product_kind : null,
    plan_tier: typeof row.plan_tier === "string" ? row.plan_tier : null,
    addon: typeof row.addon === "string" ? row.addon : null,
    pack: typeof row.pack === "string" ? row.pack : null,
    period: typeof row.period === "string" ? row.period : null,
    amount_grosz: typeof row.amount_grosz === "number" ? row.amount_grosz : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    status: typeof row.status === "string" ? row.status : null,
    grant_status: typeof row.grant_status === "string" ? row.grant_status : null,
    granted_until: typeof row.granted_until === "string" ? row.granted_until : null,
  };
}

export async function listAdminPaymentHistory(page: number): Promise<AdminPaymentHistoryResult> {
  await requireAdminPaymentHistoryAccess();
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * ADMIN_PAYMENTS_PAGE_SIZE;
  const to = from + ADMIN_PAYMENTS_PAGE_SIZE - 1;
  const admin = createSupabaseAdminClient();
  const listed = await admin
    .from("payment_orders")
    .select(ORDER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (listed.error) {
    throw new Error("admin_payment_history_load_failed");
  }
  const orders = (listed.data ?? []).map(asOrder).filter((row): row is OrderRecord => row !== null);
  const userIds = [...new Set(orders.map((row) => row.user_id))];
  const names = new Map<string, { displayName: string | null; userNumber: number | null }>();
  if (userIds.length > 0) {
    const profiles = await admin
      .from("profiles")
      .select("id, display_name, user_number")
      .in("id", userIds);
    if (!profiles.error) {
      for (const profile of profiles.data ?? []) {
        if (!profile || typeof profile.id !== "string") continue;
        names.set(profile.id, {
          displayName: typeof profile.display_name === "string" ? profile.display_name : null,
          userNumber: typeof profile.user_number === "number" ? profile.user_number : null,
        });
      }
    }
  }
  return {
    rows: orders.map((row) => {
      const profile = names.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        buyerEmail: row.buyer_email,
        product_kind: row.product_kind,
        plan_tier: row.plan_tier,
        addon: row.addon,
        pack: row.pack,
        period: row.period,
        amount_grosz: row.amount_grosz,
        currency: row.currency ?? "PLN",
        status: row.status,
        grant_status: row.grant_status,
        grantedUntil: row.granted_until,
        displayName: profile?.displayName ?? null,
        userNumber: profile?.userNumber ?? null,
      };
    }),
    total: listed.count ?? orders.length,
    page: safePage,
    pageCount: Math.max(1, Math.ceil((listed.count ?? orders.length) / ADMIN_PAYMENTS_PAGE_SIZE)),
  };
}
