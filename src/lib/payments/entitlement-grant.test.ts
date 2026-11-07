import { describe, expect, it } from "vitest";

import pl from "../../../messages/pl.json";
import en from "../../../messages/en.json";

import {
  addBillingPeriod,
  checkoutBlock,
  grantWrite,
  settleVerifiedNotification,
  type OrderLedger,
  type PlanSnapshot,
} from "@/lib/payments/entitlement-grant";
import { parseCheckoutProduct, priceGrosz } from "@/lib/payments/money";
import { isP24Configured } from "@/lib/payments/p24-config";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function order(over: Partial<OrderLedger> = {}): OrderLedger {
  return {
    status: "pending",
    grantStatus: "pending",
    amountGrosz: 1499,
    currency: "PLN",
    product: { kind: "plan", tier: "BRONZE", period: "month" },
    ...over,
  };
}

describe("billing period", () => {
  it("adds a calendar month or year in UTC and clamps the day", () => {
    expect(addBillingPeriod(new Date("2026-01-31T08:30:00.000Z"), "month").toISOString()).toBe("2026-02-28T08:30:00.000Z");
    expect(addBillingPeriod(new Date("2024-01-31T08:30:00.000Z"), "month").toISOString()).toBe("2024-02-29T08:30:00.000Z");
    expect(addBillingPeriod(new Date("2026-03-15T08:30:00.000Z"), "year").toISOString()).toBe("2027-03-15T08:30:00.000Z");
  });
});

describe("entitlement extension", () => {
  it("starts a plan now when there is no live entitlement", () => {
    const write = grantWrite({ kind: "plan", tier: "BRONZE", period: "month" }, null, null, NOW);
    expect(write).toMatchObject({ action: "plan", tier: "BRONZE", expiresAt: "2026-07-15T12:00:00.000Z", expectedPresent: false });
  });

  it("extends the same tier from the later of now and the current expiry", () => {
    const plan: PlanSnapshot = { tier: "SILVER", active: true, expiresAt: "2026-12-01T00:00:00.000Z" };
    const write = grantWrite({ kind: "plan", tier: "SILVER", period: "year" }, plan, null, NOW);
    expect(write).toMatchObject({ action: "plan", expiresAt: "2027-12-01T00:00:00.000Z" });
  });

  it("starts a higher tier now and adds the time left on the lower plan", () => {
    const plan: PlanSnapshot = { tier: "BRONZE", active: true, expiresAt: "2026-12-01T00:00:00.000Z" };
    const write = grantWrite({ kind: "plan", tier: "GOLD", period: "month" }, plan, null, NOW);
    const leftover = Date.parse("2026-12-01T00:00:00.000Z") - NOW.getTime();
    const expiresAt = new Date(addBillingPeriod(NOW, "month").getTime() + leftover).toISOString();
    expect(write).toMatchObject({ action: "plan", tier: "GOLD", expiresAt, pendingTier: null });
    expect(checkoutBlock({ kind: "plan", tier: "GOLD", period: "month" }, plan, null, NOW)).toBeNull();
  });

  it("queues a lower plan from the current end and refuses a second, different one", () => {
    const plan: PlanSnapshot = { tier: "GOLD", active: true, expiresAt: "2026-12-01T00:00:00.000Z" };
    expect(checkoutBlock({ kind: "plan", tier: "BRONZE", period: "month" }, plan, null, NOW)).toBeNull();
    expect(grantWrite({ kind: "plan", tier: "BRONZE", period: "month" }, plan, null, NOW)).toMatchObject({
      action: "schedule",
      pendingTier: "BRONZE",
      pendingExpiresAt: "2027-01-01T00:00:00.000Z",
      expectedExpiresAt: "2026-12-01T00:00:00.000Z",
    });
    const queued: PlanSnapshot = { ...plan, pendingTier: "BRONZE", pendingExpiresAt: "2027-01-01T00:00:00.000Z" };
    expect(grantWrite({ kind: "plan", tier: "BRONZE", period: "month" }, queued, null, NOW)).toMatchObject({
      action: "schedule",
      pendingExpiresAt: "2027-02-01T00:00:00.000Z",
    });
    expect(checkoutBlock({ kind: "plan", tier: "SILVER", period: "month" }, queued, null, NOW)).toBe("PENDING_PLAN");
    expect(grantWrite({ kind: "plan", tier: "SILVER", period: "month" }, queued, null, NOW)).toEqual({ action: "skip", note: "pending_plan" });
  });

  it("keeps a queued plan's length when the current plan is extended", () => {
    const plan: PlanSnapshot = {
      tier: "SILVER",
      active: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
      pendingTier: "BRONZE",
      pendingExpiresAt: "2027-01-01T00:00:00.000Z",
    };
    expect(grantWrite({ kind: "plan", tier: "SILVER", period: "month" }, plan, null, NOW)).toMatchObject({
      action: "plan",
      expiresAt: "2027-01-01T00:00:00.000Z",
      pendingTier: "BRONZE",
      pendingExpiresAt: "2027-02-01T00:00:00.000Z",
    });
  });

  it("treats a due queue as the current plan", () => {
    const plan: PlanSnapshot = {
      tier: "GOLD",
      active: true,
      expiresAt: "2026-06-01T00:00:00.000Z",
      pendingTier: "SILVER",
      pendingExpiresAt: "2026-08-01T00:00:00.000Z",
    };
    expect(grantWrite({ kind: "plan", tier: "SILVER", period: "month" }, plan, null, NOW)).toMatchObject({
      action: "plan",
      tier: "SILVER",
      expiresAt: "2026-09-01T00:00:00.000Z",
      pendingTier: null,
    });
  });

  it("does not replace a perpetual admin grant with a finite date", () => {
    const plan: PlanSnapshot = { tier: "SILVER", active: true, expiresAt: null };
    expect(checkoutBlock({ kind: "plan", tier: "GOLD", period: "year" }, plan, null, NOW)).toBe("PERPETUAL");
    expect(grantWrite({ kind: "plan", tier: "GOLD", period: "year" }, plan, null, NOW)).toEqual({ action: "skip", note: "perpetual" });
  });

  it("extends an add-on from its end, and only sells it on live Silver", () => {
    const silver: PlanSnapshot = { tier: "SILVER", active: true, expiresAt: "2026-08-01T00:00:00.000Z" };
    const gold: PlanSnapshot = { tier: "GOLD", active: true, expiresAt: "2026-08-01T00:00:00.000Z" };
    expect(checkoutBlock({ kind: "addon", addon: "reference_mastering", period: "month" }, silver, { endsAt: "2026-07-01T00:00:00.000Z" }, NOW)).toBeNull();
    const write = grantWrite({ kind: "addon", addon: "reference_mastering", period: "month" }, silver, { endsAt: "2026-07-01T00:00:00.000Z" }, NOW);
    expect(write).toMatchObject({ action: "addon", endsAt: "2026-08-01T00:00:00.000Z" });
    expect(checkoutBlock({ kind: "addon", addon: "reference_mastering", period: "month" }, gold, null, NOW)).toBe("ADDON_INCLUDED");
    expect(checkoutBlock({ kind: "addon", addon: "reference_mastering", period: "month" }, null, null, NOW)).toBe("ADDON_NEEDS_SILVER");
    expect(checkoutBlock({ kind: "addon", addon: "reference_mastering", period: "month" }, silver, { endsAt: null }, NOW)).toBe("ADDON_PERPETUAL");
  });
});

describe("webhook idempotency", () => {
  const note = { amountGrosz: 1499, currency: "PLN", merchantId: 10, posId: 10 };

  it("grants once; a replay does not move the expiry", () => {
    const first = settleVerifiedNotification({
      order: order(),
      notification: note,
      merchantId: 10,
      posId: 10,
      plan: null,
      addon: null,
      now: NOW,
    });
    expect(first.kind).toBe("granted");
    if (first.kind !== "granted") return;
    expect(first.nextPlan?.expiresAt).toBe("2026-07-15T12:00:00.000Z");

    const replay = settleVerifiedNotification({
      order: order({ status: "paid", grantStatus: "granted" }),
      notification: note,
      merchantId: 10,
      posId: 10,
      plan: first.nextPlan,
      addon: null,
      now: new Date("2026-06-15T12:05:00.000Z"),
      });
    expect(replay.kind).toBe("already");
  });

  it("rejects a different amount or currency and does not describe a grant", () => {
    expect(settleVerifiedNotification({
      order: order(),
      notification: { ...note, amountGrosz: 1 },
      merchantId: 10,
      posId: 10,
      plan: null,
      addon: null,
      now: NOW,
    })).toEqual({ kind: "rejected", code: "amount" });
    expect(settleVerifiedNotification({
      order: order(),
      notification: { ...note, currency: "EUR" },
      merchantId: 10,
      posId: 10,
      plan: null,
      addon: null,
      now: NOW,
    })).toEqual({ kind: "rejected", code: "currency" });
  });
});

describe("checkout copy", () => {
  const blocks = ["PENDING_PLAN", "PERPETUAL", "ADDON_INCLUDED", "ADDON_NEEDS_SILVER", "ADDON_PERPETUAL", "PACK_NEEDS_PAID"] as const;
  const errors = ["PAYMENTS_OFF", "CONSENT", "EMAIL", "INVALID", "RATE", "PROVIDER", "ORIGIN", "LOGIN", ...blocks] as const;

  it("has a Polish and English line for every block and error", () => {
    for (const code of blocks) {
      expect(pl.account.premiumPage.checkout.blok[code].length).toBeGreaterThan(5);
      expect(en.account.premiumPage.checkout.blok[code].length).toBeGreaterThan(5);
    }
    for (const code of errors) {
      expect(pl.account.premiumPage.checkout.blad[code].length).toBeGreaterThan(5);
      expect(en.account.premiumPage.checkout.blad[code].length).toBeGreaterThan(5);
    }
  });
});

describe("catalog amounts", () => {
  it("uses server prices in grosz and ignores a client amount", () => {
    expect(priceGrosz({ kind: "plan", tier: "BRONZE", period: "month" })).toBe(1499);
    expect(priceGrosz({ kind: "plan", tier: "BRONZE", period: "year" })).toBe(11900);
    expect(priceGrosz({ kind: "plan", tier: "SILVER", period: "month" })).toBe(2999);
    expect(priceGrosz({ kind: "plan", tier: "SILVER", period: "year" })).toBe(23900);
    expect(priceGrosz({ kind: "plan", tier: "GOLD", period: "month" })).toBe(4999);
    expect(priceGrosz({ kind: "plan", tier: "GOLD", period: "year" })).toBe(39900);
    expect(priceGrosz({ kind: "addon", addon: "reference_mastering", period: "month" })).toBe(1499);
    expect(priceGrosz({ kind: "pack", pack: "take" })).toBe(999);
    expect(priceGrosz({ kind: "pack", pack: "master" })).toBe(1499);
    expect(parseCheckoutProduct({ kind: "pack", pack: "take", units: 999, amount: 1 })).toEqual({ kind: "pack", pack: "take" });
    expect(parseCheckoutProduct({ kind: "pack", pack: "gold" })).toBeNull();
    expect(grantWrite({ kind: "pack", pack: "take" }, null, null, NOW)).toEqual({ action: "pack", pack: "take", units: 10 });
    expect(grantWrite({ kind: "pack", pack: "master" }, null, null, NOW)).toEqual({ action: "pack", pack: "master", units: 5 });
    expect(checkoutBlock({ kind: "pack", pack: "take" }, null, null, NOW)).toBeNull();
    expect(checkoutBlock({ kind: "pack", pack: "youtube" }, null, null, NOW)).toBe("PACK_NEEDS_PAID");
    expect(checkoutBlock({ kind: "pack", pack: "youtube" }, { tier: "GOLD", active: true, expiresAt: null }, null, NOW)).toBeNull();
    expect(priceGrosz({ kind: "pack", pack: "youtube" }, "GOLD")).toBe(999);
    expect(priceGrosz({ kind: "pack", pack: "youtube" }, "SILVER")).toBe(1499);
    expect(priceGrosz({ kind: "pack", pack: "youtube" }, "BRONZE")).toBe(2499);
    expect(grantWrite({ kind: "pack", pack: "youtube" }, null, null, NOW, 999)).toEqual({ action: "pack", pack: "youtube", units: 2 });
    expect(grantWrite({ kind: "pack", pack: "youtube" }, null, null, NOW, 2499)).toEqual({ action: "pack", pack: "youtube", units: 1 });
    expect(grantWrite({ kind: "pack", pack: "youtube" }, { tier: "BRONZE", active: true, expiresAt: null }, null, NOW, 999)).toEqual({ action: "pack", pack: "youtube", units: 2 });
    const parsed = parseCheckoutProduct({ kind: "plan", tier: "GOLD", period: "year", amount: 1, currency: "EUR" });
    expect(parsed).toEqual({ kind: "plan", tier: "GOLD", period: "year" });
    expect(parsed ? priceGrosz(parsed) : 0).toBe(39900);
  });

  it("treats P24 as configured only when every value, including sandbox, is set", () => {
    const full = { P24_MERCHANT_ID: "10", P24_POS_ID: "10", P24_CRC: "crc", P24_API_KEY: "key", P24_SANDBOX: "true" };
    expect(isP24Configured(full)).toBe(true);
    expect(isP24Configured({ ...full, P24_SANDBOX: "false" })).toBe(true);
    expect(isP24Configured({ ...full, P24_API_KEY: "" })).toBe(false);
    expect(isP24Configured({ ...full, P24_SANDBOX: "" })).toBe(false);
    expect(isP24Configured({})).toBe(false);
  });
});
