/**
 * W2-B controlled production fixture contract (DESIGN / CODE ONLY).
 *
 * Does NOT create, mutate, or delete premium_entitlements.
 * Live fixture creation requires a separate Owner Fixture GO.
 */

/** Marker for ops evidence / source field when Fixture GO authorizes grants. */
export const W2B_FIXTURE_SOURCE = "W2B_FIXTURE" as const;

/** Suggested display-name prefix for a dedicated fixture test account. */
export const W2B_FIXTURE_DISPLAY_NAME_PREFIX = "W2B_FIXTURE" as const;

export type W2BFixtureTierPlan = "BRONZE" | "SILVER" | "GOLD";

export const W2B_FIXTURE_TIER_SEQUENCE: readonly W2BFixtureTierPlan[] = [
  "BRONZE",
  "SILVER",
  "GOLD",
] as const;

/**
 * Expected download daily limits after W2-B cutover (matrix SSOT).
 * Used by verification plans — not a second runtime SSOT.
 */
export const W2B_FIXTURE_EXPECTED_DOWNLOADS_DAILY = {
  ANON: 2,
  FREE: 4,
  BRONZE: 10,
  SILVER: 25,
  GOLD: 50,
} as const;

export function isW2BFixtureSource(source: string | null | undefined): boolean {
  return source === W2B_FIXTURE_SOURCE;
}
