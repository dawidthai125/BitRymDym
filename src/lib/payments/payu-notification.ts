const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const EXT_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = /^[A-Z_]{1,40}$/;

export type PayuOrderNotice = {
  orderId: string;
  extOrderId: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  merchantPosId: number;
};

export type PayuStatusAction = "grant" | "ignore" | "fail" | "retry";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveAmount(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : text(value);
  if (!/^[0-9]{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function positivePos(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : text(value);
  if (!/^[0-9]{1,12}$/.test(raw) || raw === "0") return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function parsePayuNotification(body: unknown): PayuOrderNotice | null {
  const order = asRecord(asRecord(body)?.order);
  if (!order) return null;
  const orderId = text(order.orderId);
  const extOrderId = text(order.extOrderId);
  const status = text(order.status).toUpperCase();
  const currencyCode = text(order.currencyCode).toUpperCase();
  const totalAmount = positiveAmount(order.totalAmount);
  const merchantPosId = positivePos(order.merchantPosId);
  if (!ORDER_ID.test(orderId) || !EXT_ORDER_ID.test(extOrderId) || !STATUS.test(status)) return null;
  if (!totalAmount || !merchantPosId || currencyCode !== "PLN") return null;
  return { orderId, extOrderId, status, totalAmount, currencyCode, merchantPosId };
}

/** COMPLETED is the only status that may grant. Pending is acked. Unknown asks PayU to retry. */
export function payuStatusAction(status: string): PayuStatusAction {
  if (status === "COMPLETED") return "grant";
  if (status === "PENDING" || status === "WAITING_FOR_CONFIRMATION" || status === "NEW") return "ignore";
  if (status === "CANCELED" || status === "CANCELLED" || status === "REJECTED") return "fail";
  return "retry";
}
