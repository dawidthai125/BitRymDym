import { afterEach, describe, expect, it, vi } from "vitest";

const verifyP24Transaction = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments/p24-client", () => ({
  verifyP24Transaction,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

vi.mock("@/lib/email/notify/server", () => ({
  sendNotification: vi.fn(),
}));

const { POST } = await import("@/app/api/webhooks/p24/route");
const { signNotification } = await import("@/lib/payments/p24-sign");

const P24_KEYS = ["P24_MERCHANT_ID", "P24_POS_ID", "P24_CRC", "P24_API_KEY", "P24_SANDBOX"] as const;
const CRC = "crc-test-value";

function note(sign: string) {
  return {
    merchantId: 10,
    posId: 10,
    sessionId: "11111111-1111-4111-8111-111111111111",
    amount: 1499,
    originAmount: 1499,
    currency: "PLN",
    orderId: 77,
    methodId: 154,
    statement: "p24",
    sign,
  };
}

function signedNote() {
  const body = note("0".repeat(96));
  return note(
    signNotification({
      merchantId: body.merchantId,
      posId: body.posId,
      sessionId: body.sessionId,
      amount: body.amount,
      originAmount: body.originAmount,
      currency: body.currency,
      orderId: body.orderId,
      methodId: body.methodId,
      statement: body.statement,
      crc: CRC,
    }),
  );
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/webhooks/p24", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  verifyP24Transaction.mockReset();
  createSupabaseAdminClient.mockReset();
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/p24", () => {
  it("answers PAYMENTS_OFF when P24 env is missing and does not call P24", async () => {
    for (const key of P24_KEYS) vi.stubEnv(key, "");
    vi.stubEnv("P24_CRC", "super-secret-crc");
    vi.stubEnv("P24_API_KEY", "super-secret-key");

    const response = await post(note("ab".repeat(48)));
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(JSON.parse(text)).toEqual({ ok: false, code: "PAYMENTS_OFF" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).not.toContain("super-secret-crc");
    expect(text).not.toContain("super-secret-key");
    expect(verifyP24Transaction).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("still rejects a bad signature when P24 is configured", async () => {
    vi.stubEnv("P24_MERCHANT_ID", "10");
    vi.stubEnv("P24_POS_ID", "10");
    vi.stubEnv("P24_CRC", CRC);
    vi.stubEnv("P24_API_KEY", "key");
    vi.stubEnv("P24_SANDBOX", "true");

    const response = await post(note("ab".repeat(48)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false });
    expect(verifyP24Transaction).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("still looks up a signed notification and does not verify when no order exists", async () => {
    vi.stubEnv("P24_MERCHANT_ID", "10");
    vi.stubEnv("P24_POS_ID", "10");
    vi.stubEnv("P24_CRC", CRC);
    vi.stubEnv("P24_API_KEY", "key");
    vi.stubEnv("P24_SANDBOX", "false");
    createSupabaseAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });

    const response = await post(signedNote());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "ignored" });
    expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(verifyP24Transaction).not.toHaveBeenCalled();
  });
});
