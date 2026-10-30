/**
 * Premium capability / limits matrix (Design Contract SSOT).
 * W2-B: beat-download daily limits enforced at runtime via
 * `limits.downloadsDaily` + `PREMIUM_ANON_DOWNLOADS_DAILY` (ANON ≠ FREE).
 * Render daily/concurrent/quota live here; retention and Studio track caps
 * come from the plan SSOT `@/config/plan-policy` (Owner 2026-10-29: Gold keeps
 * the longest — 60 d > Silver 30 d; the old 28 d Gold < 30 d Silver bug is
 * gone). Gold 90d stays DESIGN ONLY until artifact janitor GO.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";
import { GUEST_POLICY, PLAN_POLICY } from "@/config/plan-policy";
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
   * plan-policy maxRecordingTracks + 1 Bit: FREE 2 / BRONZE 3 / SILVER 5 / GOLD 8.
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

const retention = (tier: PremiumTier) => PLAN_POLICY[tier].retentionDays * DAY;
/**
 * Total studio_tracks rows a project can hold = recording tracks + one Bit
 * track (render sizing). Recording-track enforcement uses plan-policy
 * `maxRecordingTracks` (Bit excluded) — see studio-service add/duplicate.
 */
const tracks = (tier: PremiumTier) =>
  PLAN_POLICY[tier].studio.maxRecordingTracks + 1;
const beatDownloads = (tier: PremiumTier) =>
  PLAN_POLICY[tier].downloads.beatsPerDay;

/**
 * Canonical matrix. Retention per plan-policy (FREE 2d / BRONZE 7d / SILVER 30d /
 * GOLD 60d). Design catalog may still list Gold 90d — not production-enabled
 * (`goldRetentionDesignOnly` + `isGoldRetentionProductionEnabled() === false`).
 */
export const PREMIUM_TIER_MATRIX: Record<PremiumTier, PremiumTierLimits> = {
  FREE: {
    downloadsDaily: beatDownloads("FREE"),
    rendersDaily: 5,
    rendersConcurrent: 1,
    artifactRetentionSeconds: retention("FREE"),
    artifactRetentionDesignSeconds: retention("FREE"),
    goldRetentionDesignOnly: false,
    artifactQuotaBytes: 250 * MIB,
    studioMaxTracks: tracks("FREE"),
    priority: "normal",
    capabilities: BASIC_CAPS,
  },
  BRONZE: {
    downloadsDaily: beatDownloads("BRONZE"),
    rendersDaily: 10,
    rendersConcurrent: 1,
    artifactRetentionSeconds: retention("BRONZE"),
    artifactRetentionDesignSeconds: retention("BRONZE"),
    goldRetentionDesignOnly: false,
    artifactQuotaBytes: 500 * MIB,
    studioMaxTracks: tracks("BRONZE"),
    priority: "elevated",
    capabilities: BRONZE_CAPS,
  },
  SILVER: {
    downloadsDaily: beatDownloads("SILVER"),
    rendersDaily: 20,
    rendersConcurrent: 2,
    artifactRetentionSeconds: retention("SILVER"),
    artifactRetentionDesignSeconds: retention("SILVER"),
    goldRetentionDesignOnly: false,
    artifactQuotaBytes: 2 * GIB,
    studioMaxTracks: tracks("SILVER"),
    priority: "elevated",
    capabilities: SILVER_CAPS,
  },
  GOLD: {
    downloadsDaily: beatDownloads("GOLD"),
    rendersDaily: 40,
    rendersConcurrent: 3,
    // Owner 2026-10-29: Gold keeps the longest (plan-policy 60d).
    // 90d remains design-only until janitor GO; Retention executor stays HOLD.
    artifactRetentionSeconds: retention("GOLD"),
    artifactRetentionDesignSeconds: 90 * DAY,
    goldRetentionDesignOnly: true,
    artifactQuotaBytes: 5 * GIB,
    studioMaxTracks: tracks("GOLD"),
    priority: "highest",
    capabilities: GOLD_CAPS,
  },
};

/** Guests cannot download beats (Owner 2026-10-29: GUEST_POLICY). */
export const PREMIUM_ANON_DOWNLOADS_DAILY = GUEST_POLICY.beatDownloadsPerDay;

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
