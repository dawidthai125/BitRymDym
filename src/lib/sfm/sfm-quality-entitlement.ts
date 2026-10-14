/**
 * Server-side SFM quality entitlement resolver (strict snapshot).
 * ≠ EXPORT_WAV / capabilityForRenderTier / canExportOwnTake.
 * OD-SFM-ID-05 OPEN — no auto-expand of granted_qualities after plan change.
 */

import type { PremiumTier } from "@/types/premium";
import {
  isSfmQuality,
  SFM_PLAN_MATRIX,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";

export const SFM_ACCESS_MODES = [
  "CLAIM_GRANT",
  "RE_DOWNLOAD",
  "ENQUEUE",
  "DOWNLOAD",
] as const;

export type SfmAccessMode = (typeof SFM_ACCESS_MODES)[number];

export type SfmVersionGrantView = {
  grantedQualities: readonly SfmQuality[];
};

export type SfmQualityDenyCode =
  | "FREE_NO_DOWNLOAD"
  | "PLAN_DENIED"
  | "NO_GRANT"
  | "QUALITY_DENIED"
  | "DOWNGRADE_NEW_QUALITY"
  | "INVALID_QUALITY"
  | "INVALID_TIER";

export type SfmQualityDecision =
  | { allow: true }
  | { allow: false; denyCode: SfmQualityDenyCode };

export function resolveSfmQualityEntitlement(params: {
  premiumTier: PremiumTier | unknown;
  quality: SfmQuality | unknown;
  versionGrant: SfmVersionGrantView | null;
  accessMode: SfmAccessMode;
}): SfmQualityDecision {
  const tier = params.premiumTier;
  if (
    tier !== "FREE" &&
    tier !== "BRONZE" &&
    tier !== "SILVER" &&
    tier !== "GOLD"
  ) {
    return { allow: false, denyCode: "INVALID_TIER" };
  }

  if (params.accessMode === "CLAIM_GRANT") {
    if (tier === "FREE" || SFM_PLAN_MATRIX[tier].firstDownloadsPerDay <= 0) {
      return { allow: false, denyCode: "FREE_NO_DOWNLOAD" };
    }
    return { allow: true };
  }

  if (!isSfmQuality(params.quality)) {
    return { allow: false, denyCode: "INVALID_QUALITY" };
  }
  const quality = params.quality;

  if (!params.versionGrant) {
    return { allow: false, denyCode: "NO_GRANT" };
  }

  const snapshot = params.versionGrant.grantedQualities;
  if (snapshot.includes(quality)) {
    // Strict snapshot: historical quality remains re-downloadable after downgrade.
    return { allow: true };
  }

  // Quality never in snapshot — deny (OD-SFM-ID-05 OPEN: no auto-expand).
  const planHas = SFM_PLAN_MATRIX[tier].qualities.includes(quality);
  if (!planHas) {
    return { allow: false, denyCode: "PLAN_DENIED" };
  }
  return { allow: false, denyCode: "DOWNGRADE_NEW_QUALITY" };
}

/** True when READY/object_key/URL alone must never authorize download. */
export function sfmArtifactReadyIsNotEntitlement(): true {
  return true;
}
