/**
 * W2-A — central Product Entitlement resolver (pure SSOT).
 * Server callers load profile / premium / experience, then call this.
 * Client must never supply tier / capabilities / limits.
 */

import {
  capabilitiesForPremiumTier,
  limitsForPremiumTier,
  type PremiumTierLimits,
} from "@/config/premium-tiers";
import {
  isPremiumEntitlementActive,
  type PremiumEntitlementSnapshot,
} from "@/lib/audio/effective-entitlement";
import {
  deriveCreatorRank,
  nextCreatorRankThreshold,
} from "@/lib/creator-progress/rank";
import type { CreatorRank } from "@/types/creator-progress";
import type { AccountLevel } from "@/types/domain";
import type { PremiumTier } from "@/types/premium";
import { isPremiumTier } from "@/types/premium";
import type { AudioCapabilityKey } from "@/config/audio-render";

export type ProductEntitlement = {
  userId: string | null;
  accountLevel: AccountLevel | null;
  /** Derived Creator Rank — ≠ Premium, ≠ account_level axis meaning. */
  creatorRank: CreatorRank | null;
  experienceTotal: number;
  nextRankThreshold: { rank: CreatorRank; threshold: number } | null;
  /** Effective tier after active/expiry rules. */
  premiumTier: PremiumTier;
  /** true iff effective tier !== FREE. */
  premiumActive: boolean;
  premiumSource: string | null;
  premiumExpiresAt: string | null;
  /** Stored tier on row (may differ from effective when inactive). */
  storedPremiumTier: PremiumTier | null;
  capabilities: readonly AudioCapabilityKey[];
  limits: PremiumTierLimits;
};

/**
 * Legacy binary rows (no tier / invalid tier) that are still active+valid
 * map to SILVER — never GOLD (Owner Design Contract).
 */
export function storedTierOrLegacySilver(
  row: PremiumEntitlementSnapshot | null | undefined,
  nowMs: number = Date.now(),
): PremiumTier {
  if (!row) return "FREE";
  if (!isPremiumEntitlementActive(row, nowMs)) return "FREE";
  if (row.tier && isPremiumTier(row.tier)) return row.tier;
  return "SILVER";
}

export function effectivePremiumTier(params: {
  premium: PremiumEntitlementSnapshot | null | undefined;
  nowMs?: number;
}): PremiumTier {
  return storedTierOrLegacySilver(params.premium, params.nowMs ?? Date.now());
}

/**
 * Pure product entitlement. Does not read DB.
 * Anonymous → FREE capabilities empty for audio (no Mix/Export).
 */
export function resolveProductEntitlement(params: {
  userId: string | null;
  accountLevel: AccountLevel | null;
  experienceTotal?: number;
  premium: PremiumEntitlementSnapshot | null;
  nowMs?: number;
}): ProductEntitlement {
  const nowMs = params.nowMs ?? Date.now();
  const experienceTotal = Number.isFinite(params.experienceTotal)
    ? Math.max(0, Math.floor(params.experienceTotal as number))
    : 0;

  if (!params.userId) {
    const freeLimits = limitsForPremiumTier("FREE");
    return {
      userId: null,
      accountLevel: params.accountLevel,
      creatorRank: null,
      experienceTotal: 0,
      nextRankThreshold: null,
      premiumTier: "FREE",
      premiumActive: false,
      premiumSource: null,
      premiumExpiresAt: null,
      storedPremiumTier: null,
      capabilities: [],
      limits: freeLimits,
    };
  }

  const premiumMatchesUser =
    params.premium != null && params.premium.userId === params.userId
      ? params.premium
      : null;

  const active = isPremiumEntitlementActive(premiumMatchesUser, nowMs);
  const stored =
    premiumMatchesUser && isPremiumTier(premiumMatchesUser.tier)
      ? premiumMatchesUser.tier
      : premiumMatchesUser
        ? null
        : null;

  const premiumTier = active
    ? storedTierOrLegacySilver(premiumMatchesUser, nowMs)
    : "FREE";

  const limits = limitsForPremiumTier(premiumTier);
  const capabilities = capabilitiesForPremiumTier(premiumTier);
  const creatorRank = deriveCreatorRank(experienceTotal);

  return {
    userId: params.userId,
    accountLevel: params.accountLevel,
    creatorRank,
    experienceTotal,
    nextRankThreshold: nextCreatorRankThreshold(experienceTotal),
    premiumTier,
    premiumActive: premiumTier !== "FREE",
    premiumSource: active ? (premiumMatchesUser?.source ?? null) : null,
    premiumExpiresAt: premiumMatchesUser?.expiresAt ?? null,
    storedPremiumTier: stored,
    capabilities,
    limits,
  };
}
