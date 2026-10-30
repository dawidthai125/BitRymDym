/**
 * P24 urlStatus body. The sign covers a fixed field list; anything we cannot
 * read as the documented types is rejected before we touch an order.
 */

import { notificationSignJson, sha384Hex, signEquals } from "@/lib/payments/p24-sign";

export type P24Notification = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  sign: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function intField(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value;
}

export function parseP24Notification(body: unknown): P24Notification | null {
  const row = asRecord(body);
  if (!row) return null;
  const merchantId = intField(row.merchantId);
  const posId = intField(row.posId);
  const amount = intField(row.amount);
  const originAmount = intField(row.originAmount);
  const orderId = intField(row.orderId);
  const methodId = intField(row.methodId);
  if (
    merchantId === null ||
    posId === null ||
    amount === null ||
    originAmount === null ||
    orderId === null ||
    methodId === null ||
    merchantId <= 0 ||
    posId <= 0 ||
    amount <= 0 ||
    originAmount <= 0 ||
    orderId <= 0
  ) {
    return null;
  }
  if (typeof row.sessionId !== "string" || typeof row.currency !== "string" || typeof row.statement !== "string" || typeof row.sign !== "string") {
    return null;
  }
  const sessionId = row.sessionId.trim();
  const currency = row.currency.trim().toUpperCase();
  const statement = row.statement.trim();
  const sign = row.sign.trim().toLowerCase();
  if (!/^[0-9a-f-]{8,100}$/i.test(sessionId)) return null;
  if (currency !== "PLN") return null;
  if (!statement || statement.length > 200) return null;
  if (!/^[0-9a-f]{96}$/.test(sign)) return null;
  return { merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, sign };
}

export function notificationSignValid(note: P24Notification, crc: string): boolean {
  const expected = sha384Hex(
    notificationSignJson({
      merchantId: note.merchantId,
      posId: note.posId,
      sessionId: note.sessionId,
      amount: note.amount,
      originAmount: note.originAmount,
      currency: note.currency,
      orderId: note.orderId,
      methodId: note.methodId,
      statement: note.statement,
      crc,
    }),
  );
  return signEquals(expected, note.sign);
}
