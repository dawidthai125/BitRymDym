import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PREMIUM_ANON_DOWNLOADS_DAILY,
  PREMIUM_TIER_MATRIX,
  capabilitiesForPremiumTier,
  limitsForPremiumTier,
} from "@/config/premium-tiers";
import { ANONYMOUS_DAILY_DOWNLOAD_LIMIT } from "@/config/downloads";
import {
  assertUnderConcurrentCap,
  assertUnderDailyCap,
  dailyRenderLimitForTier,
  concurrentRenderLimitForTier,
} from "@/lib/audio/render-job-core";
import {
  rejectClientChosenPremiumClaims,
} from "@/lib/audio/effective-entitlement";
import {
  masterBasicAllowed,
  masterProAllowed,
  mixProAllowed,
  sanitizeMixClientClaims,
} from "@/lib/mix/authz-core";
import { hasAudioCapability } from "@/lib/audio/effective-entitlement";
import { resolveProductEntitlement } from "@/lib/entitlements/product-entitlement";
import { dailyDownloadLimitForActor } from "@/lib/downloads/limits";
import { evaluateDailyLimit } from "@/lib/downloads/limits";
import {
  afterFinalizeSuccess,
  afterReserveSuccess,
  afterUrlFailure,
  afterUrlSuccess,
  canReserveDownloadSlot,
  downloadUsageTotal,
  hasFinalDownloadEvent,
} from "@/lib/downloads/semantics";
import {
  W2B_FIXTURE_EXPECTED_DOWNLOADS_DAILY,
  W2B_FIXTURE_SOURCE,
  isW2BFixtureSource,
} from "@/lib/entitlements/w2b-fixture-contract";
import { deriveCreatorRank } from "@/lib/creator-progress/rank";
import type { PremiumEntitlementSnapshot } from "@/lib/audio/effective-entitlement";
import type { EffectiveAudioEntitlement } from "@/lib/audio/effective-entitlement";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-04T12:00:00.000Z");

function premiumRow(
  tier: PremiumEntitlementSnapshot["tier"],
  overrides: Partial<PremiumEntitlementSnapshot> = {},
): PremiumEntitlementSnapshot {
  return {
    userId: USER,
    active: true,
    source: "manual_admin",
    expiresAt: "2099-01-01T00:00:00.000Z",
    tier,
    ...overrides,
  };
}

function entitlementFor(
  premium: PremiumEntitlementSnapshot | null,
  userId: string | null = USER,
) {
  return resolveProductEntitlement({
    userId,
    accountLevel: "BEGINNER_RAPPER",
    experienceTotal: 0,
    premium,
    nowMs: NOW,
  });
}

function audioFromProduct(
  product: ReturnType<typeof resolveProductEntitlement>,
): EffectiveAudioEntitlement {
  return {
    userId: product.userId,
    accountLevel: product.accountLevel,
    premiumActive: product.premiumActive,
    premiumSource: product.premiumSource,
    premiumExpiresAt: product.premiumExpiresAt,
    premiumTier: product.premiumTier,
    capabilities: product.capabilities,
  };
}

describe("W2-B — download tier enforcement (pure)", () => {
  it("ANON = 2 and ANON ≠ FREE", () => {
    expect(PREMIUM_ANON_DOWNLOADS_DAILY).toBe(2);
    expect(ANONYMOUS_DAILY_DOWNLOAD_LIMIT).toBe(2);
    expect(dailyDownloadLimitForActor({ actorType: "ANON" })).toBe(2);
    expect(PREMIUM_TIER_MATRIX.FREE.downloadsDaily).toBe(4);
    expect(dailyDownloadLimitForActor({ actorType: "ANON" })).not.toBe(
      PREMIUM_TIER_MATRIX.FREE.downloadsDaily,
    );
  });

  it("USER limits from product entitlement matrix (no tier ifs)", () => {
    for (const tier of ["FREE", "BRONZE", "SILVER", "GOLD"] as const) {
      const product = entitlementFor(
        tier === "FREE" ? null : premiumRow(tier),
      );
      expect(product.premiumTier).toBe(tier === "FREE" ? "FREE" : tier);
      expect(
        dailyDownloadLimitForActor({
          actorType: "USER",
          downloadsDaily: product.limits.downloadsDaily,
        }),
      ).toBe(PREMIUM_TIER_MATRIX[tier === "FREE" ? "FREE" : tier].downloadsDaily);
    }
    expect(W2B_FIXTURE_EXPECTED_DOWNLOADS_DAILY).toEqual({
      ANON: 2,
      FREE: 4,
      BRONZE: 10,
      SILVER: 25,
      GOLD: 50,
    });
  });

  it("missing / expired / inactive → FREE downloads = 4", () => {
    expect(entitlementFor(null).limits.downloadsDaily).toBe(4);
    expect(
      entitlementFor(
        premiumRow("GOLD", { expiresAt: "2020-01-01T00:00:00.000Z" }),
      ).limits.downloadsDaily,
    ).toBe(4);
    expect(
      entitlementFor(premiumRow("SILVER", { active: false })).limits
        .downloadsDaily,
    ).toBe(4);
  });

  it("cross-user entitlement ignored for caller", () => {
    const product = entitlementFor(
      premiumRow("GOLD", { userId: OTHER }),
    );
    expect(product.premiumTier).toBe("FREE");
    expect(product.limits.downloadsDaily).toBe(4);
  });

  it("client spoof of downloadsDaily rejected", () => {
    expect(() =>
      rejectClientChosenPremiumClaims({ downloadsDaily: 999 }),
    ).toThrow(/must not supply/i);
    expect(() =>
      sanitizeMixClientClaims({ downloadsDaily: 50 }),
    ).toThrow(/must not supply/i);
  });

  it("OD-17: URL failure / retry does not finalize; usage frees for retry", () => {
    const reserved = afterReserveSuccess("res-1");
    expect(hasFinalDownloadEvent(reserved)).toBe(false);
    const released = afterUrlFailure(reserved);
    expect(hasFinalDownloadEvent(released)).toBe(false);
    expect(downloadUsageTotal({ events: 0, activeReservations: 0 })).toBe(0);
    // Retry path: new reserve after release — still subject to daily limit.
    expect(
      canReserveDownloadSlot({
        usage: { events: 1, activeReservations: 0 },
        limit: 2,
      }).allowed,
    ).toBe(true);
    expect(
      canReserveDownloadSlot({
        usage: { events: 2, activeReservations: 0 },
        limit: 2,
      }).allowed,
    ).toBe(false);
    const issued = afterUrlSuccess(afterReserveSuccess("res-2"), "https://x");
    const finalized = afterFinalizeSuccess(issued, "evt-1");
    expect(hasFinalDownloadEvent(finalized)).toBe(true);
  });

  it("pure evaluateDailyLimit respects server-passed limit (Gold 50)", () => {
    expect(evaluateDailyLimit({ count: 49, limit: 50 }).allowed).toBe(true);
    expect(evaluateDailyLimit({ count: 50, limit: 50 }).allowed).toBe(false);
  });

  it("slots path requires server dailyLimit (source contract)", () => {
    const slots = readFileSync(
      resolve(process.cwd(), "src/lib/downloads/slots.ts"),
      "utf8",
    );
    expect(slots).toContain("dailyLimit: number");
    expect(slots).not.toContain("USER_DAILY_DOWNLOAD_LIMIT");
    const access = readFileSync(
      resolve(process.cwd(), "src/lib/beats/audio-access.ts"),
      "utf8",
    );
    expect(access).toContain("resolveProductEntitlementForAuthContext");
    expect(access).toContain("dailyDownloadLimitForActor");
    expect(access).toContain('actorType: "ANON"');
  });
});

describe("W2-B — render limits regression (matrix SSOT)", () => {
  it("daily / concurrent per tier", () => {
    expect(dailyRenderLimitForTier("FREE")).toBe(5);
    expect(dailyRenderLimitForTier("BRONZE")).toBe(10);
    expect(dailyRenderLimitForTier("SILVER")).toBe(20);
    expect(dailyRenderLimitForTier("GOLD")).toBe(40);
    expect(concurrentRenderLimitForTier("FREE")).toBe(1);
    expect(concurrentRenderLimitForTier("BRONZE")).toBe(1);
    expect(concurrentRenderLimitForTier("SILVER")).toBe(2);
    expect(concurrentRenderLimitForTier("GOLD")).toBe(3);
  });

  it("assertUnder* uses premiumTier; binary Premium=30 is not authoritative", () => {
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 20, premiumTier: "SILVER" }),
    ).toThrow(/Daily render limit/);
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 19, premiumTier: "SILVER" }),
    ).not.toThrow();
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 30, premiumTier: "GOLD" }),
    ).not.toThrow();
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 40, premiumTier: "GOLD" }),
    ).toThrow(/Daily render limit/);
    expect(() =>
      assertUnderConcurrentCap({ activeJobs: 3, premiumTier: "GOLD" }),
    ).toThrow(/Concurrent/);
    // Legacy binary premiumActive → SILVER (20), never 30
    expect(() =>
      assertUnderDailyCap({ jobsCreatedToday: 20, premiumActive: true }),
    ).toThrow(/Daily render limit/);
    expect(limitsForPremiumTier("SILVER").rendersDaily).toBe(20);
    expect(limitsForPremiumTier("SILVER").rendersDaily).not.toBe(30);
  });
});

describe("W2-B — Mix / export capability regression", () => {
  it("FREE Basic · BRONZE HQ · SILVER Pro · GOLD WAV", () => {
    const free = audioFromProduct(entitlementFor(null));
    expect(hasAudioCapability(free, "EXPORT_BASIC_MP3")).toBe(true);
    expect(hasAudioCapability(free, "EXPORT_HQ_MP3")).toBe(false);
    expect(mixProAllowed(free)).toBe(false);

    const bronze = audioFromProduct(entitlementFor(premiumRow("BRONZE")));
    expect(hasAudioCapability(bronze, "EXPORT_HQ_MP3")).toBe(true);
    expect(mixProAllowed(bronze)).toBe(false);
    expect(hasAudioCapability(bronze, "EXPORT_WAV")).toBe(false);

    const silver = audioFromProduct(entitlementFor(premiumRow("SILVER")));
    expect(mixProAllowed(silver)).toBe(true);
    expect(masterBasicAllowed(silver)).toBe(true);
    expect(masterProAllowed(silver)).toBe(true);
    expect(hasAudioCapability(silver, "EXPORT_WAV")).toBe(false);

    const gold = audioFromProduct(entitlementFor(premiumRow("GOLD")));
    expect(hasAudioCapability(gold, "EXPORT_WAV")).toBe(true);
    expect([...gold.capabilities]).toEqual([
      ...capabilitiesForPremiumTier("GOLD"),
    ]);
  });

  it("client spoof of tier/capabilities rejected", () => {
    expect(() =>
      sanitizeMixClientClaims({ premiumTier: "GOLD" }),
    ).toThrow();
    expect(() =>
      sanitizeMixClientClaims({ capabilities: ["EXPORT_WAV"] }),
    ).toThrow();
  });
});

describe("W2-B — entitlement / axes regression", () => {
  it("resolver Free fallbacks and paid tiers", () => {
    expect(entitlementFor(null).premiumTier).toBe("FREE");
    expect(
      entitlementFor(
        premiumRow("BRONZE", { expiresAt: "2000-01-01T00:00:00.000Z" }),
      ).premiumTier,
    ).toBe("FREE");
    expect(entitlementFor(premiumRow("BRONZE")).premiumTier).toBe("BRONZE");
    expect(entitlementFor(premiumRow("SILVER")).premiumTier).toBe("SILVER");
    expect(entitlementFor(premiumRow("GOLD")).premiumTier).toBe("GOLD");
  });

  it("account_level and Rank do not grant Premium", () => {
    const legend = resolveProductEntitlement({
      userId: USER,
      accountLevel: "LEGEND_RAPPER",
      experienceTotal: 50_000,
      premium: null,
      nowMs: NOW,
    });
    expect(legend.premiumTier).toBe("FREE");
    expect(legend.creatorRank).toBe(deriveCreatorRank(50_000));
    expect(legend.accountLevel).toBe("LEGEND_RAPPER");
    expect(legend.premiumActive).toBe(false);
  });

  it("recording Sample Policy uses Premium Tier axis (P1); Account Level is not SSOT", () => {
    const takes = readFileSync(
      resolve(process.cwd(), "src/lib/takes/entitlement.ts"),
      "utf8",
    );
    expect(takes).toContain("getSamplePolicy");
    expect(takes).toContain("BRONZE");
    expect(takes).toContain("sampleActorFromPremiumTier");
    // Transport resolves Product Entitlement — pure entitlement module stays free of server loaders.
    expect(takes).not.toContain("resolveProductEntitlement");
  });

  it("fixture contract is design-only markers", () => {
    expect(isW2BFixtureSource(W2B_FIXTURE_SOURCE)).toBe(true);
    expect(isW2BFixtureSource("manual_admin")).toBe(false);
    const fixtureMod = readFileSync(
      resolve(process.cwd(), "src/lib/entitlements/w2b-fixture-contract.ts"),
      "utf8",
    );
    expect(fixtureMod).toMatch(/Does NOT create/);
    expect(fixtureMod).not.toMatch(/\.insert\(/);
  });
});
