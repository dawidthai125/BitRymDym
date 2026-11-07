import { describe, expect, it } from "vitest";

import { registerPayuOrder, verifyPayuOrder } from "@/lib/payments/payu-client";
import { isPayuConfigured, payuOrigin, type PayuConfig } from "@/lib/payments/payu-config";
import { parsePayuNotification, payuStatusAction } from "@/lib/payments/payu-notification";
import { payuBodyMd5, payuSignatureValid } from "@/lib/payments/payu-sign";
import { customerIpFromForwarded, isPayuRedirect, isPayuRedirectFor } from "@/lib/payments/payu-url";

const config: PayuConfig = { posId: "4510332", clientSecret: "client-secret", md5Key: "md5-key", sandbox: false };

function jsonResponse(payload: unknown, status = 200, location?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (location) headers.set("location", location);
  return new Response(JSON.stringify(payload), { status, headers });
}

describe("PayU config", () => {
  const full = { PAYU_POS_ID: "4510332", PAYU_CLIENT_SECRET: "sekret", PAYU_MD5_KEY: "klucz", PAYU_SANDBOX: "false" };

  it("stays off unless sandbox is explicit and every value is set", () => {
    expect(isPayuConfigured(full)).toBe(true);
    expect(isPayuConfigured({ ...full, PAYU_SANDBOX: "true" })).toBe(true);
    expect(isPayuConfigured({ ...full, PAYU_SANDBOX: "" })).toBe(false);
    expect(isPayuConfigured({ ...full, PAYU_CLIENT_SECRET: "" })).toBe(false);
    expect(isPayuConfigured({ ...full, PAYU_MD5_KEY: "" })).toBe(false);
    expect(isPayuConfigured({})).toBe(false);
    expect(payuOrigin(false)).toBe("https://secure.payu.com");
    expect(payuOrigin(true)).toBe("https://secure.snd.payu.com");
  });
});

describe("PayU redirect and customer IP", () => {
  it("allows only the hosted host that matches the sandbox flag", () => {
    const live = "https://secure.payu.com/pay/?orderId=ABC&token=t";
    const sandbox = "https://secure.snd.payu.com/pay/?orderId=ABC";
    expect(isPayuRedirect(live)).toBe(true);
    expect(isPayuRedirect(sandbox)).toBe(true);
    expect(isPayuRedirectFor(live, false)).toBe(true);
    expect(isPayuRedirectFor(sandbox, false)).toBe(false);
    expect(isPayuRedirectFor(sandbox, true)).toBe(true);
    expect(isPayuRedirect("http://secure.payu.com/pay/")).toBe(false);
    expect(isPayuRedirect("https://evil.example/pay/")).toBe(false);
    expect(isPayuRedirect("https://secure.payu.com.evil.example/pay/")).toBe(false);
  });

  it("keeps only a single public IP hop", () => {
    expect(customerIpFromForwarded("91.102.183.87, 10.0.0.1")).toBe("91.102.183.87");
    expect(customerIpFromForwarded("2001:db8::1")).toBe("2001:db8::1");
    expect(customerIpFromForwarded("")).toBeNull();
    expect(customerIpFromForwarded("not-an-ip")).toBeNull();
  });
});

describe("PayU signature", () => {
  it("accepts MD5 of the raw body plus the second key and rejects other algorithms", () => {
    const raw = "{\"order\":{\"status\":\"COMPLETED\"}}";
    const signature = payuBodyMd5(raw, config.md5Key);
    const header = `sender=checkout;signature=${signature};algorithm=MD5;content=DOCUMENT`;
    expect(payuSignatureValid(raw, header, config.md5Key)).toBe(true);
    expect(payuSignatureValid(raw + " ", header, config.md5Key)).toBe(false);
    expect(payuSignatureValid(raw, header.replace("MD5", "SHA-256"), config.md5Key)).toBe(false);
    expect(payuSignatureValid(raw, header, "other-key")).toBe(false);
    expect(payuSignatureValid(raw, null, config.md5Key)).toBe(false);
  });
});

describe("PayU notification", () => {
  const notice = {
    order: {
      orderId: "WZHF5FFDRJ140731GUEST000P01",
      extOrderId: "11111111-1111-4111-8111-111111111111",
      status: "COMPLETED",
      totalAmount: "2999",
      currencyCode: "PLN",
      merchantPosId: "4510332",
    },
  };

  it("parses a completed order and ignores pending", () => {
    expect(parsePayuNotification(notice)).toEqual({
      orderId: "WZHF5FFDRJ140731GUEST000P01",
      extOrderId: "11111111-1111-4111-8111-111111111111",
      status: "COMPLETED",
      totalAmount: 2999,
      currencyCode: "PLN",
      merchantPosId: 4510332,
    });
    expect(payuStatusAction("COMPLETED")).toBe("grant");
    expect(payuStatusAction("PENDING")).toBe("ignore");
    expect(payuStatusAction("WAITING_FOR_CONFIRMATION")).toBe("ignore");
    expect(payuStatusAction("CANCELED")).toBe("fail");
    expect(payuStatusAction("SOMETHING_NEW")).toBe("retry");
    expect(parsePayuNotification({ order: { ...notice.order, currencyCode: "EUR" } })).toBeNull();
    expect(parsePayuNotification({ order: { ...notice.order, extOrderId: "not-ours" } })).toBeNull();
  });
});

describe("PayU client", () => {
  const input = {
    sessionId: "11111111-1111-4111-8111-111111111111",
    amountGrosz: 2999,
    description: "BitRymDym SILVER, 1 miesiąc",
    email: "fan@example.com",
    language: "pl" as const,
    customerIp: "91.102.183.87",
    continueUrl: "https://www.bitrymdym.pl/premium/return/11111111-1111-4111-8111-111111111111",
    notifyUrl: "https://www.bitrymdym.pl/api/webhooks/payu",
  };

  it("creates an order without following the redirect and keeps the secret off the order body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/oauth/authorize")) return jsonResponse({ access_token: "tok_tok_tok_tok_tok" });
      return jsonResponse({
        status: { statusCode: "SUCCESS" },
        redirectUri: "https://secure.payu.com/pay/?orderId=ORDER1&token=t",
        orderId: "ORDER1",
      }, 302);
    };
    const result = await registerPayuOrder(config, input, fetchImpl);
    expect(result).toEqual({ redirectUrl: "https://secure.payu.com/pay/?orderId=ORDER1&token=t" });
    expect(calls[1]?.init.redirect).toBe("manual");
    expect(calls[1]?.url).toBe("https://secure.payu.com/api/v2_1/orders");
    const order = JSON.parse(String(calls[1]?.init.body)) as { totalAmount: string; customerIp: string; extOrderId: string; merchantPosId: string };
    expect(order.totalAmount).toBe("2999");
    expect(order.customerIp).toBe("91.102.183.87");
    expect(order.extOrderId).toBe(input.sessionId);
    expect(order.merchantPosId).toBe("4510332");
    expect(String(calls[1]?.init.body)).not.toContain("client-secret");
    expect(String(calls[1]?.init.body)).not.toContain("md5-key");
    const auth = String(calls[0]?.init.body);
    expect(auth).toContain("grant_type=client_credentials");
    expect(auth).toContain("client_id=4510332");
    expect(auth).toContain("client_secret=client-secret");
  });

  it("rejects a redirect onto another host", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/oauth/authorize")) return jsonResponse({ access_token: "tok_tok_tok_tok_tok" });
      return jsonResponse({
        status: { statusCode: "SUCCESS" },
        redirectUri: "https://evil.example/pay/",
        orderId: "ORDER1",
      }, 302);
    };
    expect(await registerPayuOrder(config, input, fetchImpl)).toEqual({ error: "PROVIDER" });
  });

  it("verifies a completed order only when amount, ext id and POS match", async () => {
    const good = {
      status: { statusCode: "SUCCESS" },
      orders: [{
        orderId: "ORDER1",
        extOrderId: input.sessionId,
        status: "COMPLETED",
        currencyCode: "PLN",
        totalAmount: "2999",
        merchantPosId: "4510332",
      }],
    };
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/oauth/authorize")) return jsonResponse({ access_token: "tok_tok_tok_tok_tok" });
      return jsonResponse(good);
    };
    expect(await verifyPayuOrder(config, { orderId: "ORDER1", extOrderId: input.sessionId, amountGrosz: 2999 }, fetchImpl)).toBe(true);
    const pending = async (url: string) => {
      if (url.endsWith("/oauth/authorize")) return jsonResponse({ access_token: "tok_tok_tok_tok_tok" });
      return jsonResponse({ ...good, orders: [{ ...good.orders[0], status: "PENDING" }] });
    };
    expect(await verifyPayuOrder(config, { orderId: "ORDER1", extOrderId: input.sessionId, amountGrosz: 2999 }, pending)).toBe(false);
  });
});
