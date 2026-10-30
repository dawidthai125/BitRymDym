import { describe, expect, it } from "vitest";

import { registerP24Transaction, verifyP24Transaction } from "@/lib/payments/p24-client";
import type { P24Config } from "@/lib/payments/p24-config";
import { signRegister } from "@/lib/payments/p24-sign";

const config: P24Config = { merchantId: 10, posId: 20, crc: "crc-test", apiKey: "test-key", sandbox: true };

function mockFetch(payload: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

describe("P24 client", () => {
  it("registers the server amount and redirects only to the sandbox payment page", async () => {
    const { calls, fetchImpl } = mockFetch({ responseCode: 0, data: { token: "TOKENTOKEN" } });
    const result = await registerP24Transaction(config, {
      sessionId: "11111111-1111-1111-1111-111111111111",
      amountGrosz: 2999,
      description: "BitRymDym SILVER, 1 miesiąc",
      email: "fan@example.com",
      language: "pl",
      urlReturn: "https://bitrymdym.pl/premium/return/11111111-1111-1111-1111-111111111111",
      urlStatus: "https://bitrymdym.pl/api/webhooks/p24",
    }, fetchImpl);
    expect(result).toEqual({ redirectUrl: "https://sandbox.przelewy24.pl/trnRequest/TOKENTOKEN" });
    const body = JSON.parse(String(calls[0]?.init.body)) as { amount: number; sign: string; merchantId: number };
    expect(body.amount).toBe(2999);
    expect(body.merchantId).toBe(10);
    expect(body.sign).toBe(signRegister({
      sessionId: "11111111-1111-1111-1111-111111111111",
      merchantId: 10,
      amount: 2999,
      currency: "PLN",
      crc: "crc-test",
    }));
    expect(calls[0]?.url).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/register");
    expect(String(calls[0]?.init.headers && (calls[0].init.headers as Record<string, string>).authorization)).toBe(
      `Basic ${Buffer.from("20:test-key").toString("base64")}`,
    );
  });

  it("treats verify as success only when responseCode is 0", async () => {
    const ok = mockFetch({ responseCode: 0, data: { status: "success" } });
    expect(await verifyP24Transaction(config, { sessionId: "s", orderId: 5, amountGrosz: 1499 }, ok.fetchImpl)).toBe(true);
    const bad = mockFetch({ responseCode: 1 });
    expect(await verifyP24Transaction(config, { sessionId: "s", orderId: 5, amountGrosz: 1499 }, bad.fetchImpl)).toBe(false);
    expect(JSON.parse(String(ok.calls[0]?.init.body)).amount).toBe(1499);
  });
});