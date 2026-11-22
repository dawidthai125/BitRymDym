import "server-only";

import { sendNotification } from "@/lib/email/notify/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  settleVerifiedNotification,
  type GrantWrite,
  type OrderLedger,
} from "@/lib/payments/entitlement-grant";
import { checkoutProductFromOrderRow } from "@/lib/payments/money";
import { verifyP24Transaction } from "@/lib/payments/p24-client";
import { readP24Config } from "@/lib/payments/p24-config";
import { notificationSignValid, parseP24Notification } from "@/lib/payments/p24-notification";
import { PLAN_PACK_CATALOG, youtubeUnitsForGrosz } from "@/config/plan-policy";
import { recordPaymentReview } from "@/lib/payments/payment-reviews";
import { capturePayuOrder, checkPayuOrder, fetchPayuOrderNotice } from "@/lib/payments/payu-client";
import { readPayuConfig, type PayuConfig } from "@/lib/payments/payu-config";
import { parsePayuNotification, parsePayuRefund, payuRefundAction, payuStatusAction, type PayuOrderNotice } from "@/lib/payments/payu-notification";
import { payuSignatureValid } from "@/lib/payments/payu-sign";
import { loadAddonSnapshot, loadPlanSnapshot } from "@/lib/payments/snapshots";

export type WebhookOutcome =
  | { status: 200; body: { ok: true; result: "granted" | "skipped" | "already" | "ignored" | "refunded" | "review" } }
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
  beat_id: string | null;
  period: string;
  amount_grosz: number;
  currency: string;
  status: string;
  grant_status: string;
};

function orderLedger(row: OrderRow): OrderLedger | null {
  const product = checkoutProductFromOrderRow(row);
  if (!product) return null;
  if (row.status !== "pending" && row.status !== "paid" && row.status !== "failed" && row.status !== "refunded") return null;
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
  if (write.action === "schedule") {
    return `Tu BITEK. ${write.pendingTier} włączy się ${polishWhen(write.expectedExpiresAt)} i potrwa do ${polishWhen(write.pendingExpiresAt)}. Do tego dnia zostaje ${write.expectedTier}.`;
  }
  if (write.action === "addon") return `Tu BITEK. Włączyłem mastering pod wybrany utwór do ${polishWhen(write.endsAt)}.`;
  if (write.action === "pack") {
    const what = write.pack === "take" ? "nagrań" : write.pack === "youtube" ? "wideo MP4" : "masterów";
    return `Tu BITEK. Dodałem ${write.units} ${what}. Zostają, aż je wykorzystasz.`;
  }
  if (write.action === "beat") return "Tu BITEK. Wpłata doszła. Plik wav tego bitu jest do pobrania na jego stronie.";
  if (write.note === "downgrade") return "Tu BITEK. Wpłata doszła, ale niższego planu nie włączam, dopóki wyższy trwa.";
  if (write.note === "pending_plan") return "Tu BITEK. Wpłata doszła, ale inny niższy plan jest już zaplanowany. Napisz na dawid.thai@int.pl, to oddam tę wpłatę przez PayU.";
  if (write.note === "addon_perpetual") return "Tu BITEK. Wpłata doszła, ale bezterminowego dodatku nie skracam.";
  return "Tu BITEK. Wpłata doszła, ale bezterminowego planu nie skracam.";
}

function receiptFor(write: GrantWrite, result: string): string {
  if (write.action === "beat" && result === "skipped") {
    return "Tu BITEK. Wpłata doszła, ale ten wav już masz. Napisz na dawid.thai@int.pl, to oddam tę wpłatę przez PayU.";
  }
  return receiptLine(write);
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

  const row = loaded.data as Omit<OrderRow, "pack" | "beat_id"> & { pack?: string | null; beat_id?: string | null };
  let pack: string | null = null;
  let beatId: string | null = null;
  if (row.product_kind === "pack" || row.product_kind === "beat") {
    const extra = await admin.from("payment_orders").select("pack, beat_id").eq("session_id", note.sessionId).maybeSingle();
    if (extra.error || !extra.data) return { status: 503, body: { ok: false } };
    const extraRow = extra.data as { pack?: string | null; beat_id?: string | null };
    pack = extraRow.pack ?? null;
    beatId = extraRow.beat_id ?? null;
  }
  const order = orderLedger({ ...row, pack, beat_id: beatId });
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

  if (order.product.kind === "beat" && settled.write.action !== "beat") {
    console.error("[p24] beat grant refused", { sessionId: note.sessionId });
    return { status: 503, body: { ok: false } };
  }

  const applied = settled.write.action === "beat"
    ? await admin.rpc("grant_payu_beat_wav", {
        p_session_id: note.sessionId,
        p_amount: order.amountGrosz,
        p_currency: "PLN",
        p_payu_order_id: String(note.orderId),
        p_statement: note.statement,
      })
    : settled.write.action === "pack"
    ? await admin.rpc("grant_p24_quota_pack", {
        p_session_id: note.sessionId,
        p_amount: order.amountGrosz,
        p_currency: "PLN",
        p_p24_order_id: String(note.orderId),
        p_statement: note.statement,
        p_pack: settled.write.pack,
        p_units: settled.write.units,
      })
    : await admin.rpc("apply_p24_purchase", {
        p_session_id: note.sessionId,
        p_amount: order.amountGrosz,
        p_currency: "PLN",
        p_p24_order_id: String(note.orderId),
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
      data: { detail: receiptFor(settled.write, result) },
    });
    return { status: 200, body: { ok: true, result } };
  }
  if (result === "conflict") return { status: 503, body: { ok: false } };
  console.error("[p24] unexpected grant result", { sessionId: note.sessionId, result: result ?? "empty" });
  return { status: 503, body: { ok: false } };
}

async function loadOrder(sessionId: string): Promise<{ userId: string; order: OrderLedger } | "missing" | "error"> {
  const admin = createSupabaseAdminClient();
  const loaded = await admin
    .from("payment_orders")
    .select("user_id, session_id, product_kind, plan_tier, addon, period, amount_grosz, currency, status, grant_status")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (loaded.error) return "error";
  if (!loaded.data) return "missing";
  const row = loaded.data as Omit<OrderRow, "pack" | "beat_id"> & { pack?: string | null; beat_id?: string | null };
  let pack: string | null = null;
  let beatId: string | null = null;
  if (row.product_kind === "pack" || row.product_kind === "beat") {
    const extra = await admin.from("payment_orders").select("pack, beat_id").eq("session_id", sessionId).maybeSingle();
    if (extra.error || !extra.data) return "error";
    const extraRow = extra.data as { pack?: string | null; beat_id?: string | null };
    pack = extraRow.pack ?? null;
    beatId = extraRow.beat_id ?? null;
  }
  const order = orderLedger({ ...row, pack, beat_id: beatId });
  if (!order) return "error";
  return { userId: row.user_id, order };
}

export async function handlePayuWebhook(rawBody: string, signatureHeader: string | null, now = new Date()): Promise<WebhookOutcome> {
  const config = readPayuConfig();
  if (!config) return { status: 403, body: { ok: false, code: "PAYMENTS_OFF" } };
  if (!payuSignatureValid(rawBody, signatureHeader, config.md5Key)) {
    // 2026-11-22: rejections were silent; log the reason (never the key or the body).
    console.error("[payu] notification signature invalid", { hasHeader: !!signatureHeader, length: rawBody.length });
    return { status: 400, body: { ok: false } };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    console.error("[payu] notification is not JSON");
    return { status: 400, body: { ok: false } };
  }
  const note = parsePayuNotification(body);
  if (!note) {
    // Refund notifications have a different shape (top-level "refund"). Signature was verified above.
    const rawRefund = body && typeof body === "object" ? (body as Record<string, unknown>).refund : null;
    if (rawRefund && typeof rawRefund === "object") return handlePayuRefund(body);
    console.error("[payu] notification shape not recognised");
    return { status: 400, body: { ok: false } };
  }
  const outcome = await settlePayuNotice(note, config, now);
  if (outcome.status !== 200) console.error("[payu] notification not settled", { sessionId: note.extOrderId, status: note.status, http: outcome.status });
  else console.info("[payu] notification settled", { sessionId: note.extOrderId, status: note.status, result: outcome.body.result });
  return outcome;
}

/**
 * 2026-11-22: return-page fallback. When the order is still pending, ask PayU by the stored
 * orderId and settle it exactly like a verified notification. Owner-scoped; never throws.
 */
export async function reconcilePayuOrder(sessionId: string, userId: string, now = new Date()): Promise<string> {
  try {
    const config = readPayuConfig();
    if (!config) return "off";
    const admin = createSupabaseAdminClient();
    const row = await admin
      .from("payment_orders")
      .select("provider, status, provider_order_id")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    const data = row.data as { provider?: string; status?: string; provider_order_id?: string | null } | null;
    if (row.error || !data || data.provider !== "payu" || data.status !== "pending" || !data.provider_order_id) return "skip";
    const fetched = await fetchPayuOrderNotice(config, data.provider_order_id);
    if (!fetched) return "unavailable";
    const note = parsePayuNotification({ order: fetched });
    if (!note || note.extOrderId !== sessionId) return "mismatch";
    const outcome = await settlePayuNotice(note, config, now);
    console.info("[payu] return-page reconcile", { sessionId, status: note.status, http: outcome.status });
    return outcome.status === 200 ? outcome.body.result : "retry";
  } catch {
    return "error";
  }
}

/**
 * "Oczekuje na odbiór": receive the order when it matches our pending order exactly
 * (amount, currency, POS) and PayU itself confirms the same state. Then PayU sends COMPLETED.
 */
async function receiveWaitingPayuOrder(note: PayuOrderNotice, config: PayuConfig): Promise<WebhookOutcome> {
  const loaded = await loadOrder(note.extOrderId);
  if (loaded === "error") return { status: 503, body: { ok: false } };
  if (loaded === "missing") return { status: 200, body: { ok: true, result: "ignored" } };
  const admin = createSupabaseAdminClient();
  const row = await admin.from("payment_orders").select("status, amount_grosz, currency").eq("session_id", note.extOrderId).maybeSingle();
  const data = row.data as { status?: string; amount_grosz?: number; currency?: string } | null;
  if (row.error || !data) return { status: 503, body: { ok: false } };
  if (data.status !== "pending") return { status: 200, body: { ok: true, result: "ignored" } };
  if (data.amount_grosz !== note.totalAmount || data.currency !== "PLN" || String(note.merchantPosId) !== config.posId) {
    console.error("[payu] waiting order does not match", { sessionId: note.extOrderId });
    return { status: 200, body: { ok: true, result: "ignored" } };
  }
  const live = await fetchPayuOrderNotice(config, note.orderId);
  if (!live) return { status: 503, body: { ok: false } };
  const confirmed = parsePayuNotification({ order: live });
  if (!confirmed || confirmed.extOrderId !== note.extOrderId || confirmed.totalAmount !== note.totalAmount) {
    console.error("[payu] waiting order not confirmed by PayU", { sessionId: note.extOrderId });
    return { status: 200, body: { ok: true, result: "ignored" } };
  }
  if (confirmed.status === "COMPLETED") return { status: 200, body: { ok: true, result: "ignored" } };
  if (confirmed.status !== "WAITING_FOR_CONFIRMATION") return { status: 200, body: { ok: true, result: "ignored" } };
  const received = await capturePayuOrder(config, note.orderId);
  console.info("[payu] waiting order received", { sessionId: note.extOrderId, ok: received });
  return received ? { status: 200, body: { ok: true, result: "ignored" } } : { status: 503, body: { ok: false } };
}

async function settlePayuNotice(note: PayuOrderNotice, config: PayuConfig, now: Date): Promise<WebhookOutcome> {
  const action = payuStatusAction(note.status);
  // Keep PayU's orderId on the order (return-page fallback, refunds).
  await createSupabaseAdminClient().from("payment_orders").update({ provider_order_id: note.orderId })
    .eq("session_id", note.extOrderId).is("provider_order_id", null);
  if (note.status === "WAITING_FOR_CONFIRMATION") return receiveWaitingPayuOrder(note, config);
  if (action === "ignore") return { status: 200, body: { ok: true, result: "ignored" } };
  if (action === "retry") {
    console.error("[payu] notification status not settled", { sessionId: note.extOrderId, status: note.status });
    return { status: 503, body: { ok: false } };
  }

  const admin = createSupabaseAdminClient();
  if (action === "fail") {
    const failed = await admin.from("payment_orders").update({ status: "failed" }).eq("session_id", note.extOrderId).eq("status", "pending");
    if (failed.error) return { status: 503, body: { ok: false } };
    return { status: 200, body: { ok: true, result: "ignored" } };
  }

  const loaded = await loadOrder(note.extOrderId);
  if (loaded === "error") return { status: 503, body: { ok: false } };
  if (loaded === "missing") return { status: 200, body: { ok: true, result: "ignored" } };

  const [plan, addon] = await Promise.all([loadPlanSnapshot(loaded.userId), loadAddonSnapshot(loaded.userId)]);
  const settled = settleVerifiedNotification({
    order: loaded.order,
    notification: {
      amountGrosz: note.totalAmount,
      currency: note.currencyCode,
      merchantId: note.merchantPosId,
      posId: note.merchantPosId,
    },
    merchantId: Number(config.posId),
    posId: Number(config.posId),
    plan,
    addon,
    now,
  });
  if (settled.kind === "already") return { status: 200, body: { ok: true, result: "already" } };
  const wasFailed = loaded.order.status === "failed";
  if (settled.kind === "rejected") {
    if (settled.code === "amount" || settled.code === "currency" || settled.code === "merchant" || settled.code === "pos") {
      console.error("[payu] notification rejected", { sessionId: note.extOrderId, code: settled.code });
      if (wasFailed) {
        // A cancelled order that now reports a different payment: a human decides, PayU stops retrying.
        const stored = await recordPaymentReview(admin, {
          orderRef: note.extOrderId,
          reason: "failed_order_rejected",
          providerRef: note.orderId,
          details: { code: settled.code },
        });
        return stored ? { status: 200, body: { ok: true, result: "review" } } : { status: 503, body: { ok: false } };
      }
      return { status: 400, body: { ok: false } };
    }
    return { status: 503, body: { ok: false } };
  }

  const checked = await checkPayuOrder(config, {
    orderId: note.orderId,
    extOrderId: note.extOrderId,
    amountGrosz: loaded.order.amountGrosz,
  });
  if (checked === "unavailable") return { status: 503, body: { ok: false } };
  if (checked === "mismatch") {
    if (!wasFailed) return { status: 503, body: { ok: false } };
    const stored = await recordPaymentReview(admin, {
      orderRef: note.extOrderId,
      reason: "failed_order_not_completed",
      providerRef: note.orderId,
    });
    return stored ? { status: 200, body: { ok: true, result: "review" } } : { status: 503, body: { ok: false } };
  }

  if (wasFailed) {
    // Verified COMPLETED after CANCELED: reopen (failed -> pending) under the row lock, then grant as usual.
    const reopened = await admin.rpc("reopen_failed_payment_order", { p_session_id: note.extOrderId });
    if (reopened.error) {
      console.error("[payu] reopen rpc failed", { sessionId: note.extOrderId });
      return { status: 503, body: { ok: false } };
    }
    const reopenResult = (reopened.data as { result?: string } | null)?.result;
    if (reopenResult !== "reopened") {
      const stored = await recordPaymentReview(admin, {
        orderRef: note.extOrderId,
        reason: "failed_order_reopen_refused",
        providerRef: note.orderId,
        details: { result: reopenResult ?? "empty" },
      });
      return stored ? { status: 200, body: { ok: true, result: "review" } } : { status: 503, body: { ok: false } };
    }
  }

  if (settled.write.action === "skip" && (settled.write.note === "pack_amount" || settled.write.note === "pending_plan")) {
    // Paid and verified, but there is nothing the RPCs can safely grant. Queue it instead of a 503 loop.
    const reason = settled.write.note === "pack_amount" ? "unknown_pack_amount" : "pending_plan_conflict";
    console.error("[payu] paid order cannot be granted automatically", { sessionId: note.extOrderId, reason });
    const stored = await recordPaymentReview(admin, {
      orderRef: note.extOrderId,
      reason,
      providerRef: note.orderId,
      details: { amount_grosz: loaded.order.amountGrosz },
    });
    return stored ? { status: 200, body: { ok: true, result: "review" } } : { status: 503, body: { ok: false } };
  }

  if (loaded.order.product.kind === "beat" && settled.write.action !== "beat") {
    console.error("[payu] beat grant refused", { sessionId: note.extOrderId });
    return { status: 503, body: { ok: false } };
  }

  const applied = settled.write.action === "beat"
    ? await admin.rpc("grant_payu_beat_wav", {
        p_session_id: note.extOrderId,
        p_amount: loaded.order.amountGrosz,
        p_currency: "PLN",
        p_payu_order_id: note.orderId,
        p_statement: "payu",
      })
    : settled.write.action === "pack"
    ? await admin.rpc("grant_p24_quota_pack", {
        p_session_id: note.extOrderId,
        p_amount: loaded.order.amountGrosz,
        p_currency: "PLN",
        p_p24_order_id: note.orderId,
        p_statement: "payu",
        p_pack: settled.write.pack,
        p_units: settled.write.units,
      })
    : await admin.rpc("apply_p24_purchase", {
        p_session_id: note.extOrderId,
        p_amount: loaded.order.amountGrosz,
        p_currency: "PLN",
        p_p24_order_id: note.orderId,
        p_statement: "payu",
        p_write: settled.write,
      });
  if (applied.error) {
    console.error("[payu] grant rpc failed", { sessionId: note.extOrderId });
    return { status: 503, body: { ok: false } };
  }
  const result = (applied.data as { result?: string } | null)?.result;
  if (result === "already") return { status: 200, body: { ok: true, result: "already" } };
  if (result === "granted" || result === "skipped") {
    await sendNotification({
      userId: loaded.userId,
      kind: "purchase_confirmed",
      data: { detail: receiptFor(settled.write, result) },
    });
    return { status: 200, body: { ok: true, result } };
  }
  if (result === "conflict") return { status: 503, body: { ok: false } };
  console.error("[payu] unexpected grant result", { sessionId: note.extOrderId, result: result ?? "empty" });
  return { status: 503, body: { ok: false } };
}

function refundUnits(row: { product_kind: string; pack: string | null; amount_grosz: number }): number | null {
  if (row.product_kind !== "pack") return null;
  if (row.pack === "take" || row.pack === "master") return PLAN_PACK_CATALOG[row.pack].units;
  if (row.pack === "youtube") return youtubeUnitsForGrosz(row.amount_grosz);
  return null;
}

/** Signature already verified by the caller. The order is located by PayU orderId, never by extOrderId alone. */
async function handlePayuRefund(body: unknown): Promise<WebhookOutcome> {
  const refund = parsePayuRefund(body);
  if (!refund) return { status: 400, body: { ok: false } };
  console.error("[payu] refund notification received", { orderId: refund.orderId, status: refund.status });
  if (payuRefundAction(refund.status) === "ignore") return { status: 200, body: { ok: true, result: "ignored" } };

  const admin = createSupabaseAdminClient();
  const found = await admin
    .from("payment_orders")
    .select("session_id, product_kind, pack, amount_grosz")
    .eq("p24_order_id", refund.orderId)
    .maybeSingle();
  if (found.error) return { status: 503, body: { ok: false } };
  if (!found.data) {
    console.error("[payu] refund for an unknown order", { orderId: refund.orderId });
    return { status: 200, body: { ok: true, result: "ignored" } };
  }
  const order = found.data as { session_id: string; product_kind: string; pack: string | null; amount_grosz: number };
  if (refund.extOrderId && refund.extOrderId !== order.session_id) {
    const stored = await recordPaymentReview(admin, {
      orderRef: order.session_id,
      reason: "refund_ext_mismatch",
      providerRef: refund.refundId,
    });
    return stored ? { status: 200, body: { ok: true, result: "review" } } : { status: 503, body: { ok: false } };
  }

  const applied = await admin.rpc("apply_p24_refund", {
    p_provider_order_id: refund.orderId,
    p_refund_id: refund.refundId,
    p_refund_amount: refund.amount,
    p_currency: refund.currencyCode,
    p_units: refundUnits(order),
  });
  if (applied.error) {
    console.error("[payu] refund rpc failed", { orderId: refund.orderId });
    return { status: 503, body: { ok: false } };
  }
  const result = (applied.data as { result?: string } | null)?.result;
  if (result === "refunded") return { status: 200, body: { ok: true, result: "refunded" } };
  if (result === "review") return { status: 200, body: { ok: true, result: "review" } };
  if (result === "already") return { status: 200, body: { ok: true, result: "already" } };
  if (result === "missing") return { status: 200, body: { ok: true, result: "ignored" } };
  console.error("[payu] unexpected refund result", { orderId: refund.orderId, result: result ?? "empty" });
  return { status: 503, body: { ok: false } };
}
