import "server-only";

import { p24BasicAuth, p24Origin, type P24Config } from "@/lib/payments/p24-config";
import { signRegister, signVerify } from "@/lib/payments/p24-sign";
import { isP24Redirect } from "@/lib/payments/p24-url";

export type P24RegisterInput = {
  sessionId: string;
  amountGrosz: number;
  description: string;
  email: string;
  language: "pl" | "en";
  urlReturn: string;
  urlStatus: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export async function registerP24Transaction(
  config: P24Config,
  input: P24RegisterInput,
  fetchImpl: FetchLike = fetch,
): Promise<{ redirectUrl: string } | { error: "PROVIDER" }> {
  const sign = signRegister({
    sessionId: input.sessionId,
    merchantId: config.merchantId,
    amount: input.amountGrosz,
    currency: "PLN",
    crc: config.crc,
  });
  const body = {
    merchantId: config.merchantId,
    posId: config.posId,
    sessionId: input.sessionId,
    amount: input.amountGrosz,
    currency: "PLN",
    description: input.description,
    email: input.email,
    country: "PL",
    language: input.language,
    urlReturn: input.urlReturn,
    urlStatus: input.urlStatus,
    encoding: "UTF-8",
    regulationAccept: true,
    waitForResult: false,
    sign,
  };
  let response: Response;
  try {
    response = await fetchImpl(`${p24Origin(config.sandbox)}/api/v1/transaction/register`, {
      method: "POST",
      headers: {
        authorization: p24BasicAuth(config),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { error: "PROVIDER" };
  }
  if (!response.ok) return { error: "PROVIDER" };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: "PROVIDER" };
  }
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  const token = data?.token;
  if (record?.responseCode !== 0 || typeof token !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    return { error: "PROVIDER" };
  }
  const redirectUrl = `${p24Origin(config.sandbox)}/trnRequest/${token}`;
  if (!isP24Redirect(redirectUrl)) return { error: "PROVIDER" };
  return { redirectUrl };
}

export async function verifyP24Transaction(
  config: P24Config,
  input: { sessionId: string; orderId: number; amountGrosz: number },
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const sign = signVerify({
    sessionId: input.sessionId,
    orderId: input.orderId,
    amount: input.amountGrosz,
    currency: "PLN",
    crc: config.crc,
  });
  let response: Response;
  try {
    response = await fetchImpl(`${p24Origin(config.sandbox)}/api/v1/transaction/verify`, {
      method: "PUT",
      headers: {
        authorization: p24BasicAuth(config),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        merchantId: config.merchantId,
        posId: config.posId,
        sessionId: input.sessionId,
        amount: input.amountGrosz,
        currency: "PLN",
        orderId: input.orderId,
        sign,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  try {
    const payload = asRecord(await response.json());
    return payload?.responseCode === 0;
  } catch {
    return false;
  }
}
