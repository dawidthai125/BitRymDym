/**
 * PREMIUM-01 — Canonical Premium Export / Download policy SSOT.
 * Source: docs/decisions/PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md (v3 + D-1…D-4).
 *
 * Independent of SFM_PLAN_MATRIX (D-4) and of Mix/Studio capability matrix
 * (PREMIUM_TIER_MATRIX still owns render/studio track caps / beat downloads).
 *
 * Download right ≠ mix right ≠ unlock credit ≠ retention.
 */

import type { PremiumTier } from "@/types/premium";

/** Product download qualities for RAW/MIX/MASTER finished files (≠ SFM). */
export const PREMIUM_DOWNLOAD_QUALITIES = [
  "MP3_128",
  "MP3_192",
  "MP3_256",
  "MP3_320",
  "WAV_COMPAT",
  "WAV_PRO",
  "WAV_MASTER",
] as const;

export type PremiumDownloadQuality = (typeof PREMIUM_DOWNLOAD_QUALITIES)[number];

/** Weekly track-unlock credits (OD-EXPORT-08). Not transfer counts. */
export const PREMIUM_UNLOCK_CREDITS_PER_PERIOD: Record<PremiumTier, number> = {
  FREE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 4,
};

/** Credit period length from activation/purchase (not calendar week). */
export const PREMIUM_CREDIT_PERIOD_DAYS = 7;

/** Retention days from WORK_READY (OD-EXPORT-09…12). */
export const PREMIUM_RETENTION_DAYS: Record<PremiumTier, number> = {
  FREE: 7,
  BRONZE: 7,
  SILVER: 14,
  GOLD: 28,
};

/**
 * Downloadable qualities by current package (OD-EXPORT-06 + D-1).
 * FREE: empty — listen/preview may still be allowed elsewhere.
 */
export const PREMIUM_DOWNLOAD_BY_TIER: Record<
  PremiumTier,
  readonly PremiumDownloadQuality[]
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

export const PREMIUM_WAV_PROFILES = {
  WAV_COMPAT: {
    sampleRate: 44100,
    bitDepth: 16 as const,
    channels: 2 as const,
    pcmFormat: "pcm_s16le" as const,
  },
  WAV_PRO: {
    sampleRate: 44100,
    bitDepth: 24 as const,
    channels: 2 as const,
    pcmFormat: "pcm_s24le" as const,
  },
  WAV_MASTER: {
    sampleRate: 48000,
    bitDepth: 24 as const,
    channels: 2 as const,
    pcmFormat: "pcm_s24le" as const,
  },
} as const;

export type PremiumWavProfileId = keyof typeof PREMIUM_WAV_PROFILES;

export function isPremiumDownloadQuality(
  value: unknown,
): value is PremiumDownloadQuality {
  return (
    typeof value === "string" &&
    (PREMIUM_DOWNLOAD_QUALITIES as readonly string[]).includes(value)
  );
}

export function isPremiumWavProfileId(
  value: unknown,
): value is PremiumWavProfileId {
  return value === "WAV_COMPAT" || value === "WAV_PRO" || value === "WAV_MASTER";
}

/** Current-package quality check at signed-URL mint (D-3 quality live). */
export function canDownloadPremiumQuality(params: {
  premiumTier: PremiumTier;
  quality: PremiumDownloadQuality;
}): boolean {
  return PREMIUM_DOWNLOAD_BY_TIER[params.premiumTier].includes(params.quality);
}

export function unlockCreditsForTier(tier: PremiumTier): number {
  return PREMIUM_UNLOCK_CREDITS_PER_PERIOD[tier];
}

export function retentionDaysForTier(tier: PremiumTier): number {
  return PREMIUM_RETENTION_DAYS[tier];
}

export function retentionMsForTier(tier: PremiumTier): number {
  return PREMIUM_RETENTION_DAYS[tier] * 24 * 60 * 60 * 1000;
}

export function creditPeriodMs(): number {
  return PREMIUM_CREDIT_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Compute period window from activation/purchase instant (inclusive start).
 * periodIndex 0 = [activation, activation+7d).
 */
export function creditPeriodBounds(params: {
  activatedAtMs: number;
  nowMs: number;
}): { periodStartMs: number; periodEndMs: number; periodIndex: number } {
  const span = creditPeriodMs();
  const elapsed = Math.max(0, params.nowMs - params.activatedAtMs);
  const periodIndex = Math.floor(elapsed / span);
  const periodStartMs = params.activatedAtMs + periodIndex * span;
  return {
    periodStartMs,
    periodEndMs: periodStartMs + span,
    periodIndex,
  };
}

export type PremiumDownloadLadderItem = {
  quality: PremiumDownloadQuality;
  label: string;
  detail: string;
  unlocked: boolean;
  requiredTier: PremiumTier;
  lockedMessage: string | null;
};

const QUALITY_META: Record<
  PremiumDownloadQuality,
  { label: string; detail: string; requiredTier: PremiumTier }
> = {
  MP3_128: {
    label: "MP3 — 128 kbps",
    detail: "podstawowa jakość",
    requiredTier: "BRONZE",
  },
  MP3_192: {
    label: "MP3 — 192 kbps",
    detail: "wyższa jakość",
    requiredTier: "SILVER",
  },
  MP3_256: {
    label: "MP3 — 256 kbps",
    detail: "wysoka jakość",
    requiredTier: "SILVER",
  },
  MP3_320: {
    label: "MP3 — 320 kbps",
    detail: "najwyższa jakość MP3",
    requiredTier: "GOLD",
  },
  WAV_COMPAT: {
    label: "WAV Compat — 16-bit / 44,1 kHz",
    detail: "PCM stereo",
    requiredTier: "GOLD",
  },
  WAV_PRO: {
    label: "WAV Pro — 24-bit / 44,1 kHz",
    detail: "PCM stereo",
    requiredTier: "GOLD",
  },
  WAV_MASTER: {
    label: "WAV Master — 24-bit / 48 kHz",
    detail: "PCM stereo — najwyższa jakość",
    requiredTier: "GOLD",
  },
};

/** Full ladder always visible (OD-EXPORT-03 locks). Never hide rows. */
export function buildPremiumDownloadLadder(
  premiumTier: PremiumTier,
): PremiumDownloadLadderItem[] {
  return PREMIUM_DOWNLOAD_QUALITIES.map((quality) => {
    const meta = QUALITY_META[quality];
    const unlocked = canDownloadPremiumQuality({ premiumTier, quality });
    return {
      quality,
      label: meta.label,
      detail: meta.detail,
      unlocked,
      requiredTier: meta.requiredTier,
      lockedMessage: unlocked
        ? null
        : premiumTier === "FREE"
          ? "Pobieranie dostępne w pakiecie Premium."
          : `Dostępne w planie ${meta.requiredTier}.`,
    };
  });
}

/** FREE must never download finished RAW/MIX/MASTER (OD-EXPORT-03). */
export function canDownloadFinishedPremiumFiles(
  premiumTier: PremiumTier,
): boolean {
  return PREMIUM_DOWNLOAD_BY_TIER[premiumTier].length > 0;
}
