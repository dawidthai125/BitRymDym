/**
 * PREMIUM-04 — server download AuthZ helpers (pure + typed).
 * Unlock sticky · quality live · retention not shortened (D-3).
 * Does not trust client tier/quality grants.
 */

import {
  canDownloadPremiumQuality,
  isPremiumDownloadQuality,
  type PremiumDownloadQuality,
} from "@/config/premium-export-policy";
import type { PremiumTier } from "@/types/premium";
import type { RenderJobTier } from "@/types/domain";

export type PremiumDownloadDenyReason =
  | "FREE_NO_DOWNLOAD"
  | "QUALITY_NOT_IN_PLAN"
  | "NO_UNLOCK"
  | "RETENTION_EXPIRED"
  | "NOT_READY"
  | "NOT_OWNER"
  | "INVALID_QUALITY";

export type PremiumDownloadGateInput = {
  premiumTier: PremiumTier;
  quality: PremiumDownloadQuality;
  /** Sticky unlock record present for this work. */
  hasUnlock: boolean;
  /** Canonical retention clock (R1). */
  retentionExpiresAtMs: number | null;
  nowMs: number;
  workStatus: "DRAFT" | "WORK_READY" | "EXPIRED" | "DELETED" | null;
};

export type PremiumDownloadGateResult =
  | { ok: true }
  | { ok: false; reason: PremiumDownloadDenyReason };

/** Map render_job / artifact quality_tier → Premium download quality. */
export function premiumQualityFromRenderTier(
  tier: RenderJobTier | string,
): PremiumDownloadQuality | null {
  switch (tier) {
    case "BASIC_MP3":
      return "MP3_128";
    case "MP3_192":
      return "MP3_192";
    case "MP3_256":
      return "MP3_256";
    case "HQ_MP3":
      return "MP3_320";
    case "WAV":
      return "WAV_COMPAT";
    case "WAV_PRO":
      return "WAV_PRO";
    case "WAV_MASTER":
      return "WAV_MASTER";
    default:
      return isPremiumDownloadQuality(tier) ? tier : null;
  }
}

/**
 * Gate for minting a new signed URL for a finished file.
 * Already-issued URLs may live until their own TTL (documented limitation).
 */
export function evaluatePremiumDownloadGate(
  input: PremiumDownloadGateInput,
): PremiumDownloadGateResult {
  if (!canDownloadPremiumQuality({
    premiumTier: input.premiumTier,
    quality: input.quality,
  })) {
    return {
      ok: false,
      reason:
        input.premiumTier === "FREE"
          ? "FREE_NO_DOWNLOAD"
          : "QUALITY_NOT_IN_PLAN",
    };
  }

  if (input.workStatus !== "WORK_READY") {
    return { ok: false, reason: "NOT_READY" };
  }

  if (
    input.retentionExpiresAtMs == null ||
    input.retentionExpiresAtMs <= input.nowMs
  ) {
    return { ok: false, reason: "RETENTION_EXPIRED" };
  }

  if (!input.hasUnlock) {
    return { ok: false, reason: "NO_UNLOCK" };
  }

  return { ok: true };
}
