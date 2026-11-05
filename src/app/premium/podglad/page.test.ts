import { afterEach, describe, expect, it, vi } from "vitest";

class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundSignal";
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundSignal();
  },
}));

const { default: PaymentPreviewPage } = await import("@/app/premium/podglad/page");
const { AppShell } = await import("@/components/site/app-shell");
const { PremiumReturnView } = await import("@/components/premium/premium-return-view");

const P24_ENV = {
  P24_MERCHANT_ID: "10",
  P24_POS_ID: "10",
  P24_CRC: "crc",
  P24_API_KEY: "key",
  P24_SANDBOX: "true",
} as const;

function paymentsOn() {
  vi.stubEnv("PLAN_PAYMENTS_AVAILABLE", "true");
  for (const [key, value] of Object.entries(P24_ENV)) vi.stubEnv(key, value);
}

const emptyParams = { searchParams: Promise.resolve({}) };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/premium/podglad", () => {
  it("returns notFound when payments are off, even with the preview flag", async () => {
    vi.stubEnv("P24_UI_PREVIEW", "1");
    vi.stubEnv("PLAN_PAYMENTS_AVAILABLE", "false");
    for (const [key, value] of Object.entries(P24_ENV)) vi.stubEnv(key, value);
    await expect(PaymentPreviewPage(emptyParams)).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("returns notFound when the payments flag is on but P24 is not configured", async () => {
    vi.stubEnv("P24_UI_PREVIEW", "1");
    vi.stubEnv("PLAN_PAYMENTS_AVAILABLE", "true");
    vi.stubEnv("P24_CRC", "not-a-complete-config");
    await expect(PaymentPreviewPage(emptyParams)).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("keeps the dev preview when payments are available", async () => {
    paymentsOn();
    vi.stubEnv("P24_UI_PREVIEW", "1");
    const element = await PaymentPreviewPage(emptyParams);
    expect(element.type).toBe(AppShell);
  });

  it("keeps the return-state preview when payments are available", async () => {
    paymentsOn();
    vi.stubEnv("P24_UI_PREVIEW", "1");
    const element = await PaymentPreviewPage({ searchParams: Promise.resolve({ stan: "paid" }) });
    expect(element.type).toBe(PremiumReturnView);
  });

  it("still 404s in production and without the preview flag", async () => {
    paymentsOn();
    vi.stubEnv("P24_UI_PREVIEW", "1");
    vi.stubEnv("NODE_ENV", "production");
    await expect(PaymentPreviewPage(emptyParams)).rejects.toBeInstanceOf(NotFoundSignal);

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("P24_UI_PREVIEW", "");
    await expect(PaymentPreviewPage(emptyParams)).rejects.toBeInstanceOf(NotFoundSignal);
  });
});
