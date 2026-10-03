/**
 * W2-A Premium product tiers (OD-08 CLOSED).
 * Premium tier ≠ Account Level ≠ Creator Rank ≠ Role.
 */

export const PREMIUM_TIERS = [
  "FREE",
  "BRONZE",
  "SILVER",
  "GOLD",
] as const;

export type PremiumTier = (typeof PREMIUM_TIERS)[number];

export function isPremiumTier(value: unknown): value is PremiumTier {
  return (
    typeof value === "string" &&
    (PREMIUM_TIERS as readonly string[]).includes(value)
  );
}
