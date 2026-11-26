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
  /** True when the live Gold row is the ranking prize. */
  prize?: boolean;
  /** Language of the summary and the date; Polish by default. */
  locale?: "pl" | "en";
  /** True when entitlement load failed — do not claim a verified plan. */
  loadError?: boolean;
};

export type AccountPlanDisplay = {
  /** OD-PL-03 English Title Case tier label, or em dash on load error. */
  tierLabel: string;
  /** Supporting sentence for /account “Twój plan”, in the asked language. */
  summary: string;
  premiumActive: boolean;
  verified: boolean;
};

function formatExpiry(iso: string, tag: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleDateString(tag, {
      timeZone: "Europe/Warsaw",
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
  const en = input.locale === "en";
  if (input.loadError) {
    return {
      tierLabel: "—",
      summary: en
        ? "We could not read your Premium plan. Refresh the page and try again."
        : "Nie udało się odczytać planu Premium. Odśwież stronę i spróbuj ponownie.",
      premiumActive: false,
      verified: false,
    };
  }

  const effectiveTier: PremiumTier =
    input.premiumActive && input.premiumTier !== "FREE"
      ? input.premiumTier
      : "FREE";
  const prize = input.prize === true && effectiveTier === "GOLD";
  const tierLabel = prize ? "GOLD(N)" : labelPremiumTier(effectiveTier);

  if (effectiveTier === "FREE") {
    return {
      tierLabel,
      summary: en
        ? `${tierLabel} — listening, recording and a basic mix. Premium unlocks higher export quality.`
        : `${tierLabel} — odsłuch, nagrania i podstawowy mix. Wyższe jakości eksportu odblokujesz z Premium.`,
      premiumActive: false,
      verified: true,
    };
  }

  const expiryLabel = input.premiumExpiresAt
    ? formatExpiry(input.premiumExpiresAt, en ? "en-GB" : "pl-PL")
    : null;
  const expirySuffix = expiryLabel ? (en ? ` · valid until ${expiryLabel}` : ` · ważne do ${expiryLabel}`) : "";
  const planText = prize
    ? en ? "plan from a ranking prize" : "pakiet z nagrody rankingu"
    : en ? "active Premium plan" : "aktywny plan Premium";

  return {
    tierLabel,
    summary: `${tierLabel} — ${planText}${expirySuffix}.`,
    premiumActive: true,
    verified: true,
  };
}
