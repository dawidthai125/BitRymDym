/**
 * FAR-01 locked quarantine set (OD-BF-01 / B0).
 * Production mutators MUST refuse these asset ids.
 */

/** Owner-locked quarantine — never auto-migrate. */
export const FAR01_LOCKED_QUARANTINE_ASSET_IDS: ReadonlySet<string> = new Set([
  "000d406d-265e-4e49-bd3f-a542d5dd0b41",
]);

export function isFar01LockedQuarantineAssetId(assetId: string): boolean {
  return FAR01_LOCKED_QUARANTINE_ASSET_IDS.has(assetId.toLowerCase());
}
