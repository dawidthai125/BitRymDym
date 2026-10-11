/**
 * Account profile — Premium plan copy bound to product entitlement SSOT.
 * Does not read Admin APIs. Does not map account_level → Premium tier.
 */

import { labelPremiumTier } from "@/lib/ui/labels";
import type { PremiumTier } from "@/types/premium";

export type AccountPlanDisplayInput = {
  premiumTier: PremiumTier;
  premiumActive: boolean;
  premiumExpiresAt: string | null;
  /** True when entitlement load failed — do not claim a verified plan. */
  loadError?: boolean;
};

export type AccountPlanDisplay = {
  /** OD-PL-03 English Title Case tier label, or em dash on load error. */
  tierLabel: string;
  /** Polish supporting sentence for /account “Twój plan”. */
  summary: string;
  premiumActive: boolean;
  verified: boolean;
};

function formatExpiryPl(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

/**
 * Pure presentation from already-resolved product entitlement fields.
 * Callers must pass effective tier from `resolveProductEntitlement` (or AuthContext wrapper).
 */
export function formatAccountPlanDisplay(
  input: AccountPlanDisplayInput,
): AccountPlanDisplay {
  if (input.loadError) {
    return {
      tierLabel: "—",
      summary:
        "Nie udało się odczytać planu Premium. Odśwież stronę i spróbuj ponownie.",
      premiumActive: false,
      verified: false,
    };
  }

  const effectiveTier: PremiumTier =
    input.premiumActive && input.premiumTier !== "FREE"
      ? input.premiumTier
      : "FREE";
  const tierLabel = labelPremiumTier(effectiveTier);

  if (effectiveTier === "FREE") {
    return {
      tierLabel,
      summary: `${tierLabel} — odsłuch, nagrania i podstawowy miks. Wyższe jakości eksportu odblokujesz z Premium.`,
      premiumActive: false,
      verified: true,
    };
  }

  const expiryLabel = input.premiumExpiresAt
    ? formatExpiryPl(input.premiumExpiresAt)
    : null;
  const expirySuffix = expiryLabel ? ` · ważne do ${expiryLabel}` : "";

  return {
    tierLabel,
    summary: `${tierLabel} — aktywny plan Premium${expirySuffix}.`,
    premiumActive: true,
    verified: true,
  };
}
