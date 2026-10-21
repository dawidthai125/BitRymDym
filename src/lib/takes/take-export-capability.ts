/**
 * P4.4 / P4.6 / PREMIUM-01 — take-export quality ladder.
 * Canonical download policy: `@/config/premium-export-policy` (Premium SSOT).
 * MIX keeps PREMIUM_TIER_MATRIX capabilities as-is (mix ≠ download).
 * SFM keeps SFM_PLAN_MATRIX (D-4) — do not import here for decisions.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";
import {
  buildPremiumDownloadLadder,
  canDownloadPremiumQuality,
  isPremiumDownloadQuality,
  type PremiumDownloadQuality,
} from "@/config/premium-export-policy";
import type { PremiumTier } from "@/types/premium";
import type { RenderJobTier } from "@/types/domain";

/** API / UX quality keys for own-take rendered download (Premium SSOT). */
export const TAKE_EXPORT_QUALITIES = [
  "MP3_128",
  "MP3_192",
  "MP3_256",
  "MP3_320",
  "WAV_COMPAT",
  "WAV_PRO",
  "WAV_MASTER",
] as const satisfies readonly PremiumDownloadQuality[];

export type TakeExportQuality = (typeof TAKE_EXPORT_QUALITIES)[number];

/** @deprecated Prefer WAV_COMPAT — kept for request body alias only. */
export const TAKE_EXPORT_LEGACY_ALIASES: Record<string, TakeExportQuality> = {
  WAV: "WAV_COMPAT",
};

export type TakeExportLadderItem = {
  quality: TakeExportQuality;
  renderTier: RenderJobTier;
  capability: AudioCapabilityKey;
  label: string;
  detail: string;
  unlocked: boolean;
  requiredTier: PremiumTier;
  lockedMessage: string | null;
};

const QUALITY_TO_RENDER: Record<
  TakeExportQuality,
  { renderTier: RenderJobTier; capability: AudioCapabilityKey }
> = {
  MP3_128: { renderTier: "BASIC_MP3", capability: "EXPORT_BASIC_MP3" },
  MP3_192: { renderTier: "MP3_192", capability: "EXPORT_MP3_192" },
  MP3_256: { renderTier: "MP3_256", capability: "EXPORT_MP3_256" },
  MP3_320: { renderTier: "HQ_MP3", capability: "EXPORT_HQ_MP3" },
  WAV_COMPAT: { renderTier: "WAV", capability: "EXPORT_WAV" },
  WAV_PRO: { renderTier: "WAV_PRO", capability: "EXPORT_WAV_PRO" },
  WAV_MASTER: { renderTier: "WAV_MASTER", capability: "EXPORT_WAV_MASTER" },
};

/** Frozen product ladder — delegates to Premium SSOT. */
export const TAKE_EXPORT_UNLOCKED_BY_TIER: Record<
  PremiumTier,
  readonly TakeExportQuality[]
> = {
  FREE: [],
  BRONZE: ["MP3_128"],
  SILVER: ["MP3_128", "MP3_192", "MP3_256"],
  GOLD: [
    "MP3_128",
    "MP3_192",
    "MP3_256",
    "MP3_320",
    "WAV_COMPAT",
    "WAV_PRO",
    "WAV_MASTER",
  ],
};

export function normalizeTakeExportQuality(
  value: unknown,
): TakeExportQuality | null {
  if (typeof value !== "string") return null;
  const aliased = TAKE_EXPORT_LEGACY_ALIASES[value] ?? value;
  if (!isPremiumDownloadQuality(aliased)) return null;
  if (!(TAKE_EXPORT_QUALITIES as readonly string[]).includes(aliased)) {
    return null;
  }
  return aliased as TakeExportQuality;
}

export function isTakeExportQuality(
  value: unknown,
): value is TakeExportQuality {
  return normalizeTakeExportQuality(value) != null;
}

export function renderTierForTakeExportQuality(
  quality: TakeExportQuality,
): RenderJobTier {
  return QUALITY_TO_RENDER[quality].renderTier;
}

export function capabilityForTakeExportQuality(
  quality: TakeExportQuality,
): AudioCapabilityKey {
  return QUALITY_TO_RENDER[quality].capability;
}

export function canExportOwnTake(params: {
  premiumTier: PremiumTier;
  quality: TakeExportQuality;
}): boolean {
  return canDownloadPremiumQuality({
    premiumTier: params.premiumTier,
    quality: params.quality,
  });
}

/** Full ladder always — never hide higher qualities (OD-EXPORT-03). */
export function buildTakeExportLadder(
  premiumTier: PremiumTier,
): TakeExportLadderItem[] {
  return buildPremiumDownloadLadder(premiumTier).map((row) => {
    const quality = row.quality as TakeExportQuality;
    const map = QUALITY_TO_RENDER[quality];
    return {
      quality,
      renderTier: map.renderTier,
      capability: map.capability,
      label: row.label,
      detail: row.detail,
      unlocked: row.unlocked,
      requiredTier: row.requiredTier,
      lockedMessage: row.lockedMessage,
    };
  });
}

/** RAW own-take download (mic.bin) — GOLD Sample Policy only (≠ Premium unlock). */
export function canDownloadOwnTakeRaw(params: {
  canDownloadOwnTake: boolean;
}): boolean {
  return params.canDownloadOwnTake === true;
}
