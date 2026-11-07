import "server-only";

import { payuOrigin, type PayuConfig } from "@/lib/payments/payu-config";
import { isPayuRedirectFor } from "@/lib/payments/payu-url";

export type PayuRegisterInput = {
  sessionId: string;
  amountGrosz: number;
  description: string;
  email: string;
  language: "pl" | "en";
  customerIp: string;
  continueUrl: string;
  notifyUrl: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function sameAmount(value: unknown, expected: number): boolean {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return raw === String(expected);
}

function samePos(value: unknown, posId: string): boolean {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return raw === posId;
}

async function accessToken(config: PayuConfig, fetchImpl: FetchLike): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.posId,
    client_secret: config.clientSecret,
  });
  let response: Response;
  try {
    response = await fetchImpl(`${payuOrigin(config.sandbox)}/pl/standard/user/oauth/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  const token = asRecord(payload)?.access_token;
  if (typeof token !== "string" || !/^[A-Za-z0-9._~+/-]{16,4096}$/.test(token)) return null;
  return token;
}

export async function registerPayuOrder(
  config: PayuConfig,
  input: PayuRegisterInput,
  fetchImpl: FetchLike = fetch,
): Promise<{ redirectUrl: string } | { error: "PROVIDER" }> {
  const token = await accessToken(config, fetchImpl);
  if (!token) return { error: "PROVIDER" };
  const description = input.description.slice(0, 250);
  const amount = String(input.amountGrosz);
  let response: Response;
  try {
    response = await fetchImpl(`${payuOrigin(config.sandbox)}/api/v2_1/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        notifyUrl: input.notifyUrl,
        continueUrl: input.continueUrl,
        customerIp: input.customerIp,
        merchantPosId: config.posId,
        description,
        currencyCode: "PLN",
        totalAmount: amount,
        extOrderId: input.sessionId,
        buyer: { email: input.email, language: input.language },
        products: [{ name: description, unitPrice: amount, quantity: "1" }],
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { error: "PROVIDER" };
  }
  if (response.status !== 200 && response.status !== 201 && response.status !== 302) return { error: "PROVIDER" };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: "PROVIDER" };
  }
  const record = asRecord(payload);
  const statusCode = asRecord(record?.status)?.statusCode;
  const redirectUri = record?.redirectUri;
  const orderId = record?.orderId;
  const accepted = statusCode === "SUCCESS" || (typeof statusCode === "string" && statusCode.startsWith("WARNING_CONTINUE"));
  if (!accepted || typeof redirectUri !== "string" || typeof orderId !== "string") return { error: "PROVIDER" };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(orderId)) return { error: "PROVIDER" };
  if (!isPayuRedirectFor(redirectUri, config.sandbox)) return { error: "PROVIDER" };
  return { redirectUrl: redirectUri };
}

export async function verifyPayuOrder(
  config: PayuConfig,
  input: { orderId: string; extOrderId: string; amountGrosz: number },
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const token = await accessToken(config, fetchImpl);
  if (!token) return false;
  let response: Response;
  try {
    response = await fetchImpl(`${payuOrigin(config.sandbox)}/api/v2_1/orders/${encodeURIComponent(input.orderId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return false;
  }
  const record = asRecord(payload);
  if (asRecord(record?.status)?.statusCode !== "SUCCESS") return false;
  const orders = record?.orders;
  const order = Array.isArray(orders) ? asRecord(orders[0]) : null;
  if (!order) return false;
  return order.status === "COMPLETED"
    && order.orderId === input.orderId
    && order.extOrderId === input.extOrderId
    && order.currencyCode === "PLN"
    && sameAmount(order.totalAmount, input.amountGrosz)
    && samePos(order.merchantPosId, config.posId);
}
