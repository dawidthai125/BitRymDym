import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { YOUTUBE_PACK_OFFERS, youtubeUnitsForGrosz } from "@/config/plan-policy";
import { checkPayuOrder } from "@/lib/payments/payu-client";
import type { PayuConfig } from "@/lib/payments/payu-config";
import { parsePayuRefund, payuRefundAction } from "@/lib/payments/payu-notification";
import { paymentHistoryStatus } from "@/lib/admin/payment-history-present";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261121130000_payments_refunds_packs.sql"), "utf8");
const SESSION = "11111111-1111-4111-8111-111111111111";
const good = { orderId: "ORD1", extOrderId: SESSION, refund: { refundId: "55", amount: "1499", currencyCode: "PLN", status: "FINALIZED" } };

describe("parsePayuRefund", () => {
  it("parses a finalized refund and keeps extOrderId optional", () => {
    expect(parsePayuRefund(good)).toEqual({ orderId: "ORD1", extOrderId: SESSION, refundId: "55", status: "FINALIZED", amount: 1499, currencyCode: "PLN" });
    expect(parsePayuRefund({ orderId: "ORD1", refund: { refundId: "55", amount: 100, status: "finalized" } })).toMatchObject({ extOrderId: null, amount: 100, status: "FINALIZED" });
  });

  it("rejects bad ids, amounts, currency and non-refund bodies", () => {
    expect(parsePayuRefund({ ...good, orderId: "../x" })).toBeNull();
    expect(parsePayuRefund({ ...good, extOrderId: "nope" })).toBeNull();
    expect(parsePayuRefund({ ...good, refund: { ...good.refund, refundId: "" } })).toBeNull();
    expect(parsePayuRefund({ ...good, refund: { ...good.refund, amount: "0" } })).toBeNull();
    expect(parsePayuRefund({ ...good, refund: { ...good.refund, amount: "-1" } })).toBeNull();
    expect(parsePayuRefund({ ...good, refund: { ...good.refund, currencyCode: "EUR" } })).toBeNull();
    expect(parsePayuRefund({ orderId: "ORD1" })).toBeNull();
    expect(parsePayuRefund(null)).toBeNull();
  });

  it("applies only FINALIZED", () => {
    expect(payuRefundAction("FINALIZED")).toBe("apply");
    expect(payuRefundAction("PENDING")).toBe("ignore");
    expect(payuRefundAction("CANCELED")).toBe("ignore");
  });
});

describe("checkPayuOrder", () => {
  const config: PayuConfig = { posId: "4510332", clientSecret: "s", md5Key: "k", sandbox: true };
  const token = () => new Response(JSON.stringify({ access_token: "a".repeat(32) }), { status: 200 });
  const order = (over: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ status: { statusCode: "SUCCESS" }, orders: [{ orderId: "O1", extOrderId: SESSION, status: "COMPLETED", currencyCode: "PLN", totalAmount: "1499", merchantPosId: "4510332", ...over }] }), { status: 200 });
  const input = { orderId: "O1", extOrderId: SESSION, amountGrosz: 1499 };
  const run = (second: () => Response) => {
    let n = 0;
    return checkPayuOrder(config, input, async () => (n++ === 0 ? token() : second()));
  };

  it("separates ok, mismatch and unavailable", async () => {
    expect(await run(() => order())).toBe("ok");
    expect(await run(() => order({ status: "CANCELED" }))).toBe("mismatch");
    expect(await run(() => order({ totalAmount: "1" }))).toBe("mismatch");
    expect(await run(() => order({ merchantPosId: "9" }))).toBe("mismatch");
    expect(await run(() => new Response("{}", { status: 500 }))).toBe("unavailable");
  });
});

describe("pack pricing has one source", () => {
  it("youtube units follow plan-policy offers", () => {
    for (const offer of Object.values(YOUTUBE_PACK_OFFERS)) {
      expect(youtubeUnitsForGrosz(Math.round(offer.pricePln * 100))).toBe(offer.units);
    }
    expect(youtubeUnitsForGrosz(1234)).toBeNull();
  });
});

describe("payments refunds migration", () => {
  it("adds refunded status, review table and columns idempotently", () => {
    expect(sql).toMatch(/status in \('pending', 'paid', 'failed', 'refunded'\)/);
    expect(sql).toMatch(/add column if not exists granted_units/);
    expect(sql).toMatch(/create table if not exists public\.payment_order_reviews/);
    expect(sql).toMatch(/payment_order_reviews enable row level security/);
    expect(sql).toMatch(/revoke all on public\.payment_order_reviews from anon, authenticated/);
    expect(sql).not.toMatch(/drop table|truncate|delete from public\.payment_orders/i);
  });

  it("locks the order, is service_role only and idempotent for apply_p24_refund", () => {
    const body = sql.slice(sql.indexOf("function public.apply_p24_refund"));
    expect(body).toMatch(/security definer\s+set search_path = public/);
    expect(body).toMatch(/auth\.role\(\) is distinct from 'service_role'/);
    expect(body).toMatch(/where p24_order_id = p_provider_order_id\s+for update/);
    expect(body.indexOf("'already'")).toBeLessThan(body.indexOf("update public.payment_orders"));
    expect(sql).toMatch(/revoke all on function public\.apply_p24_refund\(text, text, integer, text, integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.apply_p24_refund\(text, text, integer, text, integer\) to service_role/);
    expect(sql).toMatch(/greatest\(remaining - v_units, 0\)/);
    expect(sql).toMatch(/refund_partial/);
    expect(sql).toMatch(/refund_needs_manual_review/);
    expect(sql).toMatch(/v_ent\.expires_at = v_order\.granted_until/);
  });

  it("drops hard-coded youtube prices from grant_p24_quota_pack and keeps its signature", () => {
    expect(sql).not.toMatch(/p_amount = (999|1499|2499)/);
    expect(sql).not.toMatch(/p_units is distinct from (10|5)/);
    expect(sql).toMatch(/create or replace function public\.grant_p24_quota_pack\(\s+p_session_id text,\s+p_amount integer,\s+p_currency text,\s+p_p24_order_id text,\s+p_statement text,\s+p_pack text,\s+p_units integer\s+\)/);
    expect(sql).toMatch(/granted_units = p_units/);
    expect(sql).toMatch(/reopen_failed_payment_order/);
  });
});

describe("admin status label", () => {
  it("knows refunded", () => {
    expect(paymentHistoryStatus("refunded")).toBe("refunded");
  });
});
