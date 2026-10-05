/**
 * Premium capability / limits matrix (Design Contract SSOT).
 * W2-B: beat-download daily limits enforced at runtime via
 * `limits.downloadsDaily` + `PREMIUM_ANON_DOWNLOADS_DAILY` (ANON ≠ FREE).
 * Render daily/concurrent/quota/retention: ONE authoritative source (this matrix).
 * Gold 90d retention = DESIGN ONLY until artifact janitor GO.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";
import type { PremiumTier } from "@/types/premium";

export type PremiumPriority = "normal" | "elevated" | "highest";

export type PremiumTierLimits = {
  downloadsDaily: number;
  rendersDaily: number;
  rendersConcurrent: number;
  /** Seconds used for production artifact expires_at. */
  artifactRetentionSeconds: number;
  /** Design-catalog retention (may exceed production until janitor). */
  artifactRetentionDesignSeconds: number;
  /** True when design retention must not be sold/enabled in production. */
  goldRetentionDesignOnly: boolean;
  artifactQuotaBytes: number;
  priority: PremiumPriority;
  capabilities: readonly AudioCapabilityKey[];
};

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const BASIC_CAPS = [
  "MIX_BASIC",
  "MASTER_BASIC",
  "EXPORT_BASIC_MP3",
] as const satisfies readonly AudioCapabilityKey[];

/** BRONZE+: mid MP3 + mix HQ. Take-export 320 remains SILVER+ via canExportOwnTake. */
const BRONZE_CAPS = [
  ...BASIC_CAPS,
  "EXPORT_MP3_192",
  "EXPORT_HQ_MP3",
] as const satisfies readonly AudioCapabilityKey[];

const SILVER_CAPS = [
  ...BRONZE_CAPS,
  "MIX_PRO",
  "MASTER_PRO",
] as const satisfies readonly AudioCapabilityKey[];

const GOLD_CAPS = [
  ...SILVER_CAPS,
  "EXPORT_WAV",
] as const satisfies readonly AudioCapabilityKey[];

/**
 * Canonical matrix. Gold production retention stays 30d (SILVER class)
 * while design catalog records 90d — not production-enabled.
 */
export const PREMIUM_TIER_MATRIX: Record<PremiumTier, PremiumTierLimits> = {
  FREE: {
    downloadsDaily: 4,
    rendersDaily: 5,
    rendersConcurrent: 1,
    artifactRetentionSeconds: 48 * HOUR,
    artifactRetentionDesignSeconds: 48 * HOUR,
    goldRetentionDesignOnly: false,
    artifactQuotaBytes: 250 * MIB,
    priority: "normal",
    capabilities: BASIC_CAPS,
  },
  BRONZE: {
    downloadsDaily: 10,
    rendersDaily: 10,
    rendersConcurrent: 1,
    artifactRetentionSeconds: 7 * DAY,
    artifactRetentionDesignSeconds: 7 * DAY,
    goldRetentionDesignOnly: false,
    artifactQuotaBytes: 500 * MIB,
    priority: "elevated",
    capabilities: BRONZE_CAPS,
  },
  SILVER: {
    downloadsDaily: 25,
    rendersDaily: 20,
    rendersConcurrent: 2,
    artifactRetentionSeconds: 30 * DAY,
    artifactRetentionDesignSeconds: 30 * DAY,
    goldRetentionDesignOnly: false,
    artifactQuotaBytes: 2 * GIB,
    priority: "elevated",
    capabilities: SILVER_CAPS,
  },
  GOLD: {
    downloadsDaily: 50,
    rendersDaily: 40,
    rendersConcurrent: 3,
    // PRODUCTION-SAFE until artifact janitor verifies 90d.
    artifactRetentionSeconds: 30 * DAY,
    artifactRetentionDesignSeconds: 90 * DAY,
    goldRetentionDesignOnly: true,
    artifactQuotaBytes: 5 * GIB,
    priority: "highest",
    capabilities: GOLD_CAPS,
  },
};

/** Anon beat-download baseline (OD-05) — not switched by W2-A cutover. */
export const PREMIUM_ANON_DOWNLOADS_DAILY = 2;

export function limitsForPremiumTier(tier: PremiumTier): PremiumTierLimits {
  return PREMIUM_TIER_MATRIX[tier];
}

export function capabilitiesForPremiumTier(
  tier: PremiumTier,
): readonly AudioCapabilityKey[] {
  return PREMIUM_TIER_MATRIX[tier].capabilities;
}

/** Gold 90d must never be treated as production-enabled in W2-A. */
export function isGoldRetentionProductionEnabled(): boolean {
  return false;
}
