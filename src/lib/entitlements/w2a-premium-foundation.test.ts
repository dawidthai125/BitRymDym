import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_DAILY_DOWNLOAD_LIMIT,
  USER_DAILY_DOWNLOAD_LIMIT,
} from "@/config/downloads";
import {
  PREMIUM_ANON_DOWNLOADS_DAILY,
  PREMIUM_TIER_MATRIX,
  capabilitiesForPremiumTier,
  isGoldRetentionProductionEnabled,
  limitsForPremiumTier,
} from "@/config/premium-tiers";
import {
  FREE_AUDIO_CAPABILITIES,
  rejectClientChosenPremiumClaims,
  resolveEffectiveAudioEntitlement,
  type PremiumEntitlementSnapshot,
} from "@/lib/audio/effective-entitlement";
import {
  buildRenderJobEntitlementSnapshot,
  dailyRenderLimitForTier,
  parseRenderJobEntitlementSnapshot,
  retentionSecondsForTier,
} from "@/lib/audio/render-job-core";
import { deriveCreatorRank } from "@/lib/creator-progress/rank";
import {
  effectivePremiumTier,
  resolveProductEntitlement,
  storedTierOrLegacySilver,
} from "@/lib/entitlements/product-entitlement";
import { defaultMixParameters, serializeMixParameters } from "@/lib/mix/params";
import { ACCOUNT_LEVELS } from "@/types/domain";
import { PREMIUM_TIERS, isPremiumTier } from "@/types/premium";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function premium(
  partial: Partial<PremiumEntitlementSnapshot> & {
    expiresAt: string | null;
  },
): PremiumEntitlementSnapshot {
  return {
    userId: USER,
    active: true,
    source: "manual_admin",
    ...partial,
  };
}

describe("W2-A — Premium tier foundation (unit/contract)", () => {
  it("A: accepts only FREE/BRONZE/SILVER/GOLD", () => {
    expect([...PREMIUM_TIERS]).toEqual(["FREE", "BRONZE", "SILVER", "GOLD"]);
    expect(isPremiumTier("SILVER")).toBe(true);
    expect(isPremiumTier("PLATINUM")).toBe(false);
    expect(isPremiumTier("BEGINNER_RAPPER")).toBe(false);
  });

  it("B: legacy active Premium → SILVER (never GOLD)", () => {
    expect(storedTierOrLegacySilver(premium({ expiresAt: null }))).toBe(
      "SILVER",
    );
    const product = resolveProductEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: premium({ expiresAt: null }),
    });
    expect(product.premiumTier).toBe("SILVER");
    expect(product.premiumActive).toBe(true);
    expect(product.premiumTier).not.toBe("GOLD");
  });

  it("C: expired Premium → FREE effective", () => {
    const expiresAt = "2026-10-01T00:00:00.000Z";
    const at = new Date(expiresAt).getTime();
    expect(
      effectivePremiumTier({
        premium: premium({ expiresAt }),
        nowMs: at,
      }),
    ).toBe("FREE");
  });

  it("D: inactive Premium → FREE effective", () => {
    expect(
      effectivePremiumTier({
        premium: premium({
          active: false,
          expiresAt: "2099-01-01T00:00:00.000Z",
          tier: "GOLD",
        }),
      }),
    ).toBe("FREE");
  });

  it("E: no entitlement → FREE", () => {
    const product = resolveProductEntitlement({
      userId: USER,
      accountLevel: "PRO_RAPPER",
      premium: null,
    });
    expect(product.premiumTier).toBe("FREE");
    expect(product.premiumActive).toBe(false);
    expect([...product.capabilities]).toEqual([...FREE_AUDIO_CAPABILITIES]);
  });

  it("F: central product resolver returns rank + experience + tier + caps + limits", () => {
    const product = resolveProductEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 150,
      premium: premium({ expiresAt: null, tier: "BRONZE" }),
    });
    expect(product.creatorRank).toBe(deriveCreatorRank(150));
    expect(product.experienceTotal).toBe(150);
    expect(product.premiumTier).toBe("BRONZE");
    expect(product.capabilities).toEqual(capabilitiesForPremiumTier("BRONZE"));
    expect(product.limits).toEqual(limitsForPremiumTier("BRONZE"));
    expect(product.accountLevel).toBe("BEGINNER_RAPPER");
  });

  it("G: capability matrix matches Design Contract", () => {
    expect(PREMIUM_TIER_MATRIX.FREE.downloadsDaily).toBe(4);
    expect(PREMIUM_TIER_MATRIX.FREE.rendersDaily).toBe(5);
    expect(PREMIUM_TIER_MATRIX.FREE.rendersConcurrent).toBe(1);
    expect(PREMIUM_TIER_MATRIX.FREE.artifactQuotaBytes).toBe(250 * 1024 * 1024);
    expect(PREMIUM_TIER_MATRIX.BRONZE.downloadsDaily).toBe(10);
    expect(PREMIUM_TIER_MATRIX.BRONZE.rendersDaily).toBe(10);
    expect(PREMIUM_TIER_MATRIX.SILVER.downloadsDaily).toBe(25);
    expect(PREMIUM_TIER_MATRIX.SILVER.rendersDaily).toBe(20);
    expect(PREMIUM_TIER_MATRIX.SILVER.rendersConcurrent).toBe(2);
    expect(PREMIUM_TIER_MATRIX.GOLD.downloadsDaily).toBe(50);
    expect(PREMIUM_TIER_MATRIX.GOLD.rendersDaily).toBe(40);
    expect(PREMIUM_TIER_MATRIX.GOLD.rendersConcurrent).toBe(3);
    expect(capabilitiesForPremiumTier("FREE")).not.toContain("EXPORT_HQ_MP3");
    expect(capabilitiesForPremiumTier("BRONZE")).toContain("EXPORT_MP3_192");
    expect(capabilitiesForPremiumTier("BRONZE")).toContain("EXPORT_HQ_MP3");
    expect(capabilitiesForPremiumTier("BRONZE")).not.toContain("MIX_PRO");
    expect(capabilitiesForPremiumTier("SILVER")).toContain("MIX_PRO");
    expect(capabilitiesForPremiumTier("SILVER")).not.toContain("EXPORT_WAV");
    expect(capabilitiesForPremiumTier("GOLD")).toContain("EXPORT_WAV");
  });

  it("H–K: client tier/premium/capability/limit spoof rejected", () => {
    expect(() =>
      rejectClientChosenPremiumClaims({ premiumTier: "GOLD" }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ tier: "SILVER" }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ premiumActive: true }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ premium: true }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ capabilities: ["EXPORT_WAV"] }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ limits: { rendersDaily: 999 } }),
    ).toThrow();
    expect(() =>
      rejectClientChosenPremiumClaims({ downloadsDaily: 999 }),
    ).toThrow();
  });

  it("L–N: migration REVOKE authenticated/anon DML; keep own SELECT policy in E3.1", () => {
    const w2a = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261003230000_w2a_premium_tier_foundation.sql",
      ),
      "utf8",
    );
    expect(w2a).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.premium_entitlements FROM anon/);
    expect(w2a).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.premium_entitlements FROM authenticated/,
    );
    expect(w2a).not.toMatch(/REVOKE SELECT/i);

    const e31 = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260928200000_e3_1_audio_foundation.sql",
      ),
      "utf8",
    );
    expect(e31).toMatch(/premium_entitlements_select_own/);
    expect(e31).toMatch(/user_id\s*=\s*\(SELECT auth\.uid\(\)\)/);
  });

  it("O: render snapshot contains tier + capabilities + limits", () => {
    const entitlement = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: premium({ expiresAt: null, tier: "SILVER" }),
    });
    const snap = buildRenderJobEntitlementSnapshot({
      entitlement,
      parameters: serializeMixParameters(defaultMixParameters()),
      paramsVersion: 1,
    });
    expect(snap.entitlement.premiumTier).toBe("SILVER");
    expect(snap.entitlement.capabilities).toContain("MIX_PRO");
    expect(snap.entitlement.limits.rendersDaily).toBe(20);
    expect(snap.entitlement.limits.rendersConcurrent).toBe(2);
    expect(snap.entitlement.limits.artifactQuotaBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(snap.entitlement.limits.goldRetentionDesignOnly).toBe(false);
  });

  it("P: account_level remains independent of Premium", () => {
    for (const level of ACCOUNT_LEVELS) {
      const product = resolveProductEntitlement({
        userId: USER,
        accountLevel: level,
        premium: null,
      });
      expect(product.accountLevel).toBe(level);
      expect(product.premiumTier).toBe("FREE");
    }
  });

  it("Q: Creator Rank remains independent of Premium", () => {
    const freeHighXp = resolveProductEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 10_000,
      premium: null,
    });
    const goldLowXp = resolveProductEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      premium: premium({ expiresAt: null, tier: "GOLD" }),
    });
    expect(freeHighXp.creatorRank).toBe(deriveCreatorRank(10_000));
    expect(goldLowXp.creatorRank).toBe(deriveCreatorRank(0));
    expect(freeHighXp.premiumTier).toBe("FREE");
    expect(goldLowXp.premiumTier).toBe("GOLD");
    expect(freeHighXp.creatorRank).not.toBe(goldLowXp.creatorRank);
  });

  it("R: Gold 90d is design-only / not production-enabled", () => {
    expect(isGoldRetentionProductionEnabled()).toBe(false);
    const gold = limitsForPremiumTier("GOLD");
    expect(gold.goldRetentionDesignOnly).toBe(true);
    expect(gold.artifactRetentionDesignSeconds).toBe(90 * 24 * 60 * 60);
    expect(gold.artifactRetentionSeconds).toBe(30 * 24 * 60 * 60);
    expect(retentionSecondsForTier("GOLD")).toBe(30 * 24 * 60 * 60);
  });

  it("S: E3 audio wrapper delegates to product resolver (single SSOT)", () => {
    const audio = resolveEffectiveAudioEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 40,
      premium: premium({ expiresAt: null, tier: "BRONZE" }),
    });
    const product = resolveProductEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 40,
      premium: premium({ expiresAt: null, tier: "BRONZE" }),
    });
    expect(audio.premiumTier).toBe(product.premiumTier);
    expect(audio.premiumActive).toBe(product.premiumActive);
    expect([...audio.capabilities]).toEqual([...product.capabilities]);
  });

  it("T: W1 Creator Progress surfaces remain orthogonal (no Premium in award)", () => {
    const award = readFileSync(
      resolve(process.cwd(), "src/lib/creator-progress/award.ts"),
      "utf8",
    );
    expect(award).not.toContain("resolveProductEntitlement");
    expect(award).not.toContain("premiumTier");
    expect(award).not.toContain("BRONZE");
  });

  it("download matrix SSOT (W2-B enforces at runtime via entitlement limits)", () => {
    expect(ANONYMOUS_DAILY_DOWNLOAD_LIMIT).toBe(2);
    expect(USER_DAILY_DOWNLOAD_LIMIT).toBe(4); // FREE baseline mirror only
    expect(PREMIUM_ANON_DOWNLOADS_DAILY).toBe(2);
    expect(PREMIUM_TIER_MATRIX.FREE.downloadsDaily).toBe(4);
    expect(PREMIUM_TIER_MATRIX.BRONZE.downloadsDaily).toBe(10);
    expect(PREMIUM_TIER_MATRIX.SILVER.downloadsDaily).toBe(25);
    expect(PREMIUM_TIER_MATRIX.GOLD.downloadsDaily).toBe(50);
  });

  it("legacy binary render snapshot normalizes to SILVER limits", () => {
    const legacy = {
      entitlement: {
        userId: USER,
        accountLevel: "BEGINNER_RAPPER" as const,
        premiumActive: true,
        premiumSource: "manual_admin",
        premiumExpiresAt: null,
        capabilities: [...capabilitiesForPremiumTier("SILVER")],
      },
      parameters: serializeMixParameters(defaultMixParameters()),
      paramsVersion: 1,
    };
    const parsed = parseRenderJobEntitlementSnapshot(legacy);
    expect(parsed.entitlement.premiumTier).toBe("SILVER");
    expect(parsed.entitlement.limits.rendersDaily).toBe(
      dailyRenderLimitForTier("SILVER"),
    );
  });

  it("ignores cross-user premium row", () => {
    const product = resolveProductEntitlement({
      userId: USER,
      accountLevel: "BEGINNER_RAPPER",
      premium: premium({ userId: OTHER, expiresAt: null, tier: "GOLD" }),
    });
    expect(product.premiumTier).toBe("FREE");
  });

  it("migration: premium_tier enum + legacy SILVER backfill + no billing", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261003230000_w2a_premium_tier_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TYPE public\.premium_tier AS ENUM/);
    expect(sql).toMatch(/ADD COLUMN tier public\.premium_tier/);
    expect(sql).toMatch(/THEN 'SILVER'::public\.premium_tier/);
    expect(sql).not.toMatch(/stripe/i);
    expect(sql).not.toMatch(/subscription/i);
    expect(sql).not.toMatch(/CREATE TABLE.*billing/i);
    expect(sql).not.toMatch(/CREATE.*janitor/i);
    expect(sql).toMatch(/Does NOT enable billing/);
  });
});
