/**
 * P4.4 / P4.6 — take-export quality ladder (stricter than E3 MIX).
 * MIX keeps PREMIUM_TIER_MATRIX capabilities as-is.
 * TAKE_EXPORT uses this resolver only.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";
import type { PremiumTier } from "@/types/premium";
import type { RenderJobTier } from "@/types/domain";

/** UX / API quality keys for own-take rendered download. */
export const TAKE_EXPORT_QUALITIES = [
  "MP3_128",
  "MP3_192",
  "MP3_320",
  "WAV",
] as const;

export type TakeExportQuality = (typeof TAKE_EXPORT_QUALITIES)[number];

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

const QUALITY_META: Record<
  TakeExportQuality,
  {
    renderTier: RenderJobTier;
    capability: AudioCapabilityKey;
    label: string;
    detail: string;
    requiredTier: PremiumTier;
  }
> = {
  MP3_128: {
    renderTier: "BASIC_MP3",
    capability: "EXPORT_BASIC_MP3",
    label: "MP3 — 128 kbps",
    detail: "podstawowa jakość",
    requiredTier: "FREE",
  },
  MP3_192: {
    renderTier: "MP3_192",
    capability: "EXPORT_MP3_192",
    label: "MP3 — 192 kbps",
    detail: "wyższa jakość",
    requiredTier: "BRONZE",
  },
  MP3_320: {
    renderTier: "HQ_MP3",
    capability: "EXPORT_HQ_MP3",
    label: "MP3 — 320 kbps",
    detail: "najwyższa jakość MP3",
    requiredTier: "SILVER",
  },
  WAV: {
    renderTier: "WAV",
    capability: "EXPORT_WAV",
    label: "WAV",
    detail: "bezstratny plik audio — jakość studyjna",
    requiredTier: "GOLD",
  },
};

/** Frozen product ladder for TAKE_EXPORT only (not MIX). */
export const TAKE_EXPORT_UNLOCKED_BY_TIER: Record<
  PremiumTier,
  readonly TakeExportQuality[]
> = {
  FREE: ["MP3_128"],
  BRONZE: ["MP3_128", "MP3_192"],
  SILVER: ["MP3_128", "MP3_192", "MP3_320"],
  GOLD: ["MP3_128", "MP3_192", "MP3_320", "WAV"],
};

export function isTakeExportQuality(
  value: unknown,
): value is TakeExportQuality {
  return (
    typeof value === "string" &&
    (TAKE_EXPORT_QUALITIES as readonly string[]).includes(value)
  );
}

export function renderTierForTakeExportQuality(
  quality: TakeExportQuality,
): RenderJobTier {
  return QUALITY_META[quality].renderTier;
}

export function capabilityForTakeExportQuality(
  quality: TakeExportQuality,
): AudioCapabilityKey {
  return QUALITY_META[quality].capability;
}

export function canExportOwnTake(params: {
  premiumTier: PremiumTier;
  quality: TakeExportQuality;
}): boolean {
  return TAKE_EXPORT_UNLOCKED_BY_TIER[params.premiumTier].includes(
    params.quality,
  );
}

/** Full ladder always — never hide higher qualities. */
export function buildTakeExportLadder(
  premiumTier: PremiumTier,
): TakeExportLadderItem[] {
  return TAKE_EXPORT_QUALITIES.map((quality) => {
    const meta = QUALITY_META[quality];
    const unlocked = canExportOwnTake({ premiumTier, quality });
    return {
      quality,
      renderTier: meta.renderTier,
      capability: meta.capability,
      label: meta.label,
      detail: meta.detail,
      unlocked,
      requiredTier: meta.requiredTier,
      lockedMessage: unlocked
        ? null
        : `Dostępne w planie ${meta.requiredTier}.`,
    };
  });
}

/** RAW own-take download (mic.bin) — GOLD Sample Policy only. */
export function canDownloadOwnTakeRaw(params: {
  canDownloadOwnTake: boolean;
}): boolean {
  return params.canDownloadOwnTake === true;
}
