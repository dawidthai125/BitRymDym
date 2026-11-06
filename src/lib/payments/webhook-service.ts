import "server-only";

import { sendNotification } from "@/lib/email/notify/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  settleVerifiedNotification,
  type GrantWrite,
  type OrderLedger,
} from "@/lib/payments/entitlement-grant";
import { parseCheckoutProduct } from "@/lib/payments/money";
import { verifyP24Transaction } from "@/lib/payments/p24-client";
import { readP24Config } from "@/lib/payments/p24-config";
import { notificationSignValid, parseP24Notification } from "@/lib/payments/p24-notification";
import { loadAddonSnapshot, loadPlanSnapshot } from "@/lib/payments/snapshots";

export type WebhookOutcome =
  | { status: 200; body: { ok: true; result: "granted" | "skipped" | "already" | "ignored" } }
  | { status: 400; body: { ok: false } }
  | { status: 403; body: { ok: false; code: "PAYMENTS_OFF" } }
  | { status: 503; body: { ok: false } };

type OrderRow = {
  user_id: string;
  session_id: string;
  product_kind: string;
  plan_tier: string | null;
  addon: string | null;
  pack: string | null;
  period: string;
  amount_grosz: number;
  currency: string;
  status: string;
  grant_status: string;
};

function orderLedger(row: OrderRow): OrderLedger | null {
  const product = parseCheckoutProduct(
    row.product_kind === "plan"
      ? { kind: "plan", tier: row.plan_tier, period: row.period }
      : row.product_kind === "pack"
        ? { kind: "pack", pack: row.pack }
        : { kind: "addon", addon: row.addon, period: row.period },
  );
  if (!product) return null;
  if (row.status !== "pending" && row.status !== "paid" && row.status !== "failed") return null;
  if (row.grant_status !== "pending" && row.grant_status !== "granted" && row.grant_status !== "skipped") return null;
  if (!Number.isSafeInteger(row.amount_grosz)) return null;
  return {
    status: row.status,
    grantStatus: row.grant_status,
    amountGrosz: row.amount_grosz,
    currency: row.currency,
    product,
  };
}

function polishWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "Europe/Warsaw" }).format(date);
}

function receiptLine(write: GrantWrite): string {
  if (write.action === "plan") return `Tu BITEK. Włączyłem ${write.tier} do ${polishWhen(write.expiresAt)}.`;
  if (write.action === "addon") return `Tu BITEK. Włączyłem mastering z referencją do ${polishWhen(write.endsAt)}.`;
  if (write.action === "pack") {
    const what = write.pack === "take" ? "nagrań" : write.pack === "youtube" ? "wideo MP4" : "masterów";
    return `Tu BITEK. Dodałem ${write.units} ${what}. Zostają, aż je wykorzystasz.`;
  }
  if (write.note === "downgrade") return "Tu BITEK. Wpłata doszła, ale niższego planu nie włączam, dopóki wyższy trwa.";
  if (write.note === "addon_perpetual") return "Tu BITEK. Wpłata doszła, ale bezterminowego dodatku nie skracam.";
  return "Tu BITEK. Wpłata doszła, ale bezterminowego planu nie skracam.";
}

export async function handleP24Webhook(body: unknown, now = new Date()): Promise<WebhookOutcome> {
  const config = readP24Config();
  // Closed checkout, same code as POST /api/payments/p24/checkout. Not an ack and not a retryable outage.
  if (!config) return { status: 403, body: { ok: false, code: "PAYMENTS_OFF" } };

  const note = parseP24Notification(body);
  if (!note || !notificationSignValid(note, config.crc)) {
    return { status: 400, body: { ok: false } };
  }
  if (note.amount !== note.originAmount) {
    return { status: 400, body: { ok: false } };
  }

  const admin = createSupabaseAdminClient();
  const loaded = await admin
    .from("payment_orders")
    .select("user_id, session_id, product_kind, plan_tier, addon, period, amount_grosz, currency, status, grant_status")
    .eq("session_id", note.sessionId)
    .maybeSingle();
  if (loaded.error) return { status: 503, body: { ok: false } };
  if (!loaded.data) return { status: 200, body: { ok: true, result: "ignored" } };

  const row = loaded.data as Omit<OrderRow, "pack"> & { pack?: string | null };
  let pack: string | null = null;
  if (row.product_kind === "pack") {
    const extra = await admin.from("payment_orders").select("pack").eq("session_id", note.sessionId).maybeSingle();
    if (extra.error || !extra.data) return { status: 503, body: { ok: false } };
    pack = (extra.data as { pack?: string | null }).pack ?? null;
  }
  const order = orderLedger({ ...row, pack });
  if (!order) return { status: 503, body: { ok: false } };

  const userId = (loaded.data as OrderRow).user_id;
  const [plan, addon] = await Promise.all([loadPlanSnapshot(userId), loadAddonSnapshot(userId)]);
  const settled = settleVerifiedNotification({
    order,
    notification: {
      amountGrosz: note.amount,
      currency: note.currency,
      merchantId: note.merchantId,
      posId: note.posId,
    },
    merchantId: config.merchantId,
    posId: config.posId,
    plan,
    addon,
    now,
  });

  if (settled.kind === "already") return { status: 200, body: { ok: true, result: "already" } };
  if (settled.kind === "rejected") {
    if (settled.code === "amount" || settled.code === "currency" || settled.code === "merchant" || settled.code === "pos") {
      console.error("[p24] notification rejected", { sessionId: note.sessionId, code: settled.code });
      return { status: 400, body: { ok: false } };
    }
    return { status: 503, body: { ok: false } };
  }

  const verified = await verifyP24Transaction(config, {
    sessionId: note.sessionId,
    orderId: note.orderId,
    amountGrosz: order.amountGrosz,
  });
  if (!verified) return { status: 503, body: { ok: false } };

  const applied = settled.write.action === "pack"
    ? await admin.rpc("grant_p24_quota_pack", {
        p_session_id: note.sessionId,
        p_amount: order.amountGrosz,
        p_currency: "PLN",
        p_p24_order_id: note.orderId,
        p_statement: note.statement,
        p_pack: settled.write.pack,
        p_units: settled.write.units,
      })
    : await admin.rpc("apply_p24_purchase", {
        p_session_id: note.sessionId,
        p_amount: order.amountGrosz,
        p_currency: "PLN",
        p_p24_order_id: note.orderId,
        p_statement: note.statement,
        p_write: settled.write,
      });
  if (applied.error) {
    console.error("[p24] grant rpc failed", { sessionId: note.sessionId });
    return { status: 503, body: { ok: false } };
  }
  const result = (applied.data as { result?: string } | null)?.result;
  if (result === "already") return { status: 200, body: { ok: true, result: "already" } };
  if (result === "granted" || result === "skipped") {
    await sendNotification({
      userId,
      kind: "purchase_confirmed",
      data: { detail: receiptLine(settled.write) },
    });
    return { status: 200, body: { ok: true, result } };
  }
  if (result === "conflict") return { status: 503, body: { ok: false } };
  console.error("[p24] unexpected grant result", { sessionId: note.sessionId, result: result ?? "empty" });
  return { status: 503, body: { ok: false } };
}
