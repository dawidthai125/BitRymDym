/**
 * Premium capability / limits matrix (Design Contract SSOT).
 * W2-B: beat-download daily limits enforced at runtime via
 * `limits.downloadsDaily` + `PREMIUM_ANON_DOWNLOADS_DAILY` (ANON ≠ FREE).
 * Render daily/concurrent/quota/retention: ONE authoritative source (this matrix).
 * Gold production retention = **28 days** (Owner 2026-10-25; aligns with
 * `PREMIUM_RETENTION_DAYS.GOLD` / OD-EXPORT-12). Gold 90d = DESIGN ONLY until
 * artifact janitor GO. Premium Retention feature remains HOLD.
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
  /**
   * Max studio_tracks rows per project (BEAT counts; Master does not).
   * FREE 2 / BRONZE 3 / SILVER 5 / GOLD 8 — Phase 5 Track CRUD SSOT.
   */
  studioMaxTracks: number;
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

/**
 * Mix/Studio capability overlay (≠ Premium download ladder).
 * Download qualities are gated by `@/config/premium-export-policy`.
 * BRONZE+ may bake HQ for Studio listen; finished-file download still SSOT.
 */
const BRONZE_CAPS = [
  ...BASIC_CAPS,
  "EXPORT_MP3_192",
  "EXPORT_HQ_MP3",
] as const satisfies readonly AudioCapabilityKey[];

const SILVER_CAPS = [
  ...BRONZE_CAPS,
  "MIX_PRO",
  "MASTER_PRO",
  "EXPORT_MP3_256",
] as const satisfies readonly AudioCapabilityKey[];

const GOLD_CAPS = [
  ...SILVER_CAPS,
  "EXPORT_WAV",
  "EXPORT_WAV_PRO",
  "EXPORT_WAV_MASTER",
] as const satisfies readonly AudioCapabilityKey[];

/**
 * Canonical matrix. Gold production retention = 28d (Owner 2026-10-25).
 * SILVER stays 30d. Design catalog may still list Gold 90d — not production-enabled
 * (`goldRetentionDesignOnly` + `isGoldRetentionProductionEnabled() === false`).
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
    studioMaxTracks: 2,
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
    studioMaxTracks: 3,
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
    studioMaxTracks: 5,
    priority: "elevated",
    capabilities: SILVER_CAPS,
  },
  GOLD: {
    downloadsDaily: 50,
    rendersDaily: 40,
    rendersConcurrent: 3,
    // Owner 2026-10-25: production Gold = 28d (same unit DAY as SILVER/others).
    // 90d remains design-only until janitor GO; Retention executor stays HOLD.
    artifactRetentionSeconds: 28 * DAY,
    artifactRetentionDesignSeconds: 90 * DAY,
    goldRetentionDesignOnly: true,
    artifactQuotaBytes: 5 * GIB,
    studioMaxTracks: 8,
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
