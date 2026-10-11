import { describe, expect, it } from "vitest";

import { formatAccountPlanDisplay } from "@/lib/account/account-plan-display";
import { resolveProductEntitlement } from "@/lib/entitlements/product-entitlement";
import { labelPremiumTier } from "@/lib/ui/labels";

describe("formatAccountPlanDisplay", () => {
  it("shows active GOLD via labelPremiumTier SSOT", () => {
    const product = resolveProductEntitlement({
      userId: "u-gold",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      premium: {
        userId: "u-gold",
        active: true,
        source: "admin",
        expiresAt: null,
        tier: "GOLD",
      },
    });
    expect(product.premiumTier).toBe("GOLD");
    expect(product.premiumActive).toBe(true);

    const display = formatAccountPlanDisplay({
      premiumTier: product.premiumTier,
      premiumActive: product.premiumActive,
      premiumExpiresAt: product.premiumExpiresAt,
    });

    expect(display.verified).toBe(true);
    expect(display.premiumActive).toBe(true);
    expect(display.tierLabel).toBe(labelPremiumTier("GOLD"));
    expect(display.tierLabel).toBe("Gold");
    expect(display.summary).toContain("Gold");
    expect(display.summary).toContain("aktywny plan Premium");
    expect(display.summary).not.toMatch(/Darmowy/i);
    expect(display.summary).not.toContain("Początkujący raper");
  });

  it("shows Free when no active Premium row", () => {
    const product = resolveProductEntitlement({
      userId: "u-free",
      accountLevel: "PRO_RAPPER",
      experienceTotal: 100,
      premium: null,
    });
    expect(product.premiumTier).toBe("FREE");

    const display = formatAccountPlanDisplay({
      premiumTier: product.premiumTier,
      premiumActive: product.premiumActive,
      premiumExpiresAt: product.premiumExpiresAt,
    });

    expect(display.verified).toBe(true);
    expect(display.premiumActive).toBe(false);
    expect(display.tierLabel).toBe("Free");
    expect(display.summary).toContain("Free");
    expect(display.summary).toMatch(/Premium/);
    expect(display.summary).not.toMatch(/Darmowy/i);
    // account_level must not drive plan copy
    expect(display.summary).not.toContain("Pro raper");
  });

  it("treats expired entitlement as Free (resolver SSOT)", () => {
    const product = resolveProductEntitlement({
      userId: "u-expired",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      premium: {
        userId: "u-expired",
        active: true,
        source: "admin",
        expiresAt: "2020-01-01T00:00:00.000Z",
        tier: "GOLD",
      },
      nowMs: Date.parse("2026-10-11T00:00:00.000Z"),
    });
    expect(product.premiumTier).toBe("FREE");
    expect(product.premiumActive).toBe(false);

    const display = formatAccountPlanDisplay({
      premiumTier: product.premiumTier,
      premiumActive: product.premiumActive,
      premiumExpiresAt: product.premiumExpiresAt,
    });

    expect(display.tierLabel).toBe("Free");
    expect(display.premiumActive).toBe(false);
    expect(display.summary).not.toContain("Gold");
    expect(display.summary).not.toMatch(/Darmowy/i);
  });

  it("does not claim a verified plan on load error", () => {
    const display = formatAccountPlanDisplay({
      premiumTier: "GOLD",
      premiumActive: true,
      premiumExpiresAt: null,
      loadError: true,
    });

    expect(display.verified).toBe(false);
    expect(display.tierLabel).toBe("—");
    expect(display.summary).toMatch(/Nie udało się odczytać/);
    expect(display.summary).not.toContain("Gold");
    expect(display.summary).not.toMatch(/Darmowy/i);
    expect(display.premiumActive).toBe(false);
  });

  it("includes expiry date for active timed Premium", () => {
    const product = resolveProductEntitlement({
      userId: "u-silver",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      premium: {
        userId: "u-silver",
        active: true,
        source: "admin",
        expiresAt: "2030-06-15T12:00:00.000Z",
        tier: "SILVER",
      },
      nowMs: Date.parse("2026-10-11T00:00:00.000Z"),
    });

    const display = formatAccountPlanDisplay({
      premiumTier: product.premiumTier,
      premiumActive: product.premiumActive,
      premiumExpiresAt: product.premiumExpiresAt,
    });

    expect(display.tierLabel).toBe("Silver");
    expect(display.summary).toContain("ważne do");
    expect(display.summary).toContain("2030");
  });
});

describe("account page Premium plan wiring (source contract)", () => {
  it("binds Twój plan to product entitlement resolver, not hardcoded Darmowy", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const page = readFileSync(
      join(process.cwd(), "src/app/account/page.tsx"),
      "utf8",
    );
    expect(page).toContain("resolveProductEntitlementForAuthContext");
    expect(page).toContain("formatAccountPlanDisplay");
    expect(page).not.toMatch(
      /Darmowy — odsłuch, nagrania i podstawowy miks/,
    );
  });
});
