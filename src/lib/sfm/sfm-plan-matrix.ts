/**
 * SFM plan × quality matrix (SSOT product contract OD-SFM-07).
 * Independent of PREMIUM_TIER_MATRIX.EXPORT_WAV / TAKE ladders / beat limits.
 */

import type { PremiumTier } from "@/types/premium";
import { isPremiumTier } from "@/types/premium";

export const SFM_QUALITIES = [
  "MP3_128",
  "MP3_192",
  "MP3_320",
  "WAV",
] as const;

export type SfmQuality = (typeof SFM_QUALITIES)[number];

export type SfmPlanMatrixEntry = {
  /** Catalog / in-app listen — always true for authenticated plans in contract. */
  listen: true;
  qualities: readonly SfmQuality[];
  /** First-download (version grant) limit per Europe/Warsaw calendar day. */
  firstDownloadsPerDay: number;
};

/**
 * Frozen SFM product matrix. SILVER = MP3_128 + MP3_192 only.
 * Do not derive from EXPORT_WAV or canExportOwnTake.
 */
export const SFM_PLAN_MATRIX: Readonly<
  Record<PremiumTier, SfmPlanMatrixEntry>
> = {
  FREE: {
    listen: true,
    qualities: [],
    firstDownloadsPerDay: 0,
  },
  BRONZE: {
    listen: true,
    qualities: ["MP3_128"],
    firstDownloadsPerDay: 1,
  },
  SILVER: {
    listen: true,
    qualities: ["MP3_128", "MP3_192"],
    firstDownloadsPerDay: 2,
  },
  GOLD: {
    listen: true,
    qualities: ["MP3_128", "MP3_192", "MP3_320", "WAV"],
    firstDownloadsPerDay: 5,
  },
} as const;

/** Technical notes (documentation SSOT; encode path is later stages). */
export const SFM_QUALITY_TECH = {
  MP3_128: { container: "mp3", cbrKbps: 128 },
  MP3_192: { container: "mp3", cbrKbps: 192 },
  MP3_320: { container: "mp3", cbrKbps: 320 },
  WAV: {
    container: "wav",
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
  },
} as const;

export function isSfmQuality(value: unknown): value is SfmQuality {
  return (
    typeof value === "string" &&
    (SFM_QUALITIES as readonly string[]).includes(value)
  );
}

export function sfmPlanEntryForTier(tier: PremiumTier): SfmPlanMatrixEntry {
  return SFM_PLAN_MATRIX[tier];
}

/** Snapshot of downloadable qualities at FIRST_GRANT (strict until OD-SFM-ID-05). */
export function sfmGrantedQualitiesSnapshot(
  tier: PremiumTier,
): SfmQuality[] {
  return [...SFM_PLAN_MATRIX[tier].qualities];
}

export function sfmDailyFirstDownloadLimit(tier: PremiumTier): number {
  return SFM_PLAN_MATRIX[tier].firstDownloadsPerDay;
}

export function assertPremiumTierForSfm(value: unknown): PremiumTier {
  if (!isPremiumTier(value)) {
    throw new Error(`Invalid premium tier for SFM: ${String(value)}`);
  }
  return value;
}
