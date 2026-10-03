/**
 * E3.2 / W2-A — Effective audio entitlement (compatibility SSOT surface).
 * Delegates Premium tier + capabilities to product entitlement resolver.
 * Account Level ≠ Premium. Role ≠ Premium. Creator Rank ≠ Premium.
 * Recording limits stay in takes/entitlement.ts — do not merge.
 */

import {
  AUDIO_CAPABILITY_KEYS,
  type AudioCapabilityKey,
} from "@/config/audio-render";
import { capabilitiesForPremiumTier } from "@/config/premium-tiers";
import {
  effectivePremiumTier,
  resolveProductEntitlement,
} from "@/lib/entitlements/product-entitlement";
import type { AccountLevel } from "@/types/domain";
import type { PremiumTier } from "@/types/premium";

/** Free authenticated baseline capabilities (tier FREE). */
export const FREE_AUDIO_CAPABILITIES = capabilitiesForPremiumTier("FREE");

/**
 * Union of paid-tier audio capabilities (BRONZE∪SILVER∪GOLD).
 * Not granted wholesale — use tier matrix via resolver.
 */
export const PREMIUM_AUDIO_CAPABILITIES = [
  "MIX_PRO",
  "MASTER_PRO",
  "EXPORT_HQ_MP3",
  "EXPORT_WAV",
] as const satisfies readonly AudioCapabilityKey[];

/** Snapshot of premium_entitlements row — server-loaded only. */
export type PremiumEntitlementSnapshot = {
  userId: string;
  active: boolean;
  source: string;
  /** Canonical expiry column. null = no scheduled expiry while active. */
  expiresAt: string | null;
  /**
   * W2-A stored tier. Missing/invalid + active → treated as SILVER (legacy).
   */
  tier?: PremiumTier | null;
};

export type EffectiveAudioEntitlement = {
  userId: string | null;
  accountLevel: AccountLevel | null;
  /** true only when effective premium tier !== FREE. */
  premiumActive: boolean;
  /** Effective Premium tier after active/expiry rules. */
  premiumTier: PremiumTier;
  premiumSource: string | null;
  premiumExpiresAt: string | null;
  capabilities: readonly AudioCapabilityKey[];
};

export class AudioEntitlementError extends Error {
  readonly code: "FORBIDDEN" | "UNAUTHENTICATED" = "FORBIDDEN";
  constructor(
    message: string,
    code: "FORBIDDEN" | "UNAUTHENTICATED" = "FORBIDDEN",
  ) {
    super(message);
    this.name = "AudioEntitlementError";
    this.code = code;
  }
}

/**
 * Premium active iff:
 * active === true AND (expires_at IS NULL OR expires_at > now).
 * Exactly at expires_at → inactive (same class as take expiry).
 */
export function isPremiumEntitlementActive(
  row: PremiumEntitlementSnapshot | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!row || row.active !== true) return false;
  if (row.expiresAt == null || row.expiresAt === "") return true;
  return new Date(row.expiresAt).getTime() > nowMs;
}

/**
 * Pure effective audio entitlement.
 * Thin wrapper over resolveProductEntitlement (single Premium SSOT).
 */
export function resolveEffectiveAudioEntitlement(params: {
  userId: string | null;
  accountLevel: AccountLevel | null;
  premium: PremiumEntitlementSnapshot | null;
  experienceTotal?: number;
  nowMs?: number;
}): EffectiveAudioEntitlement {
  const product = resolveProductEntitlement({
    userId: params.userId,
    accountLevel: params.accountLevel,
    premium: params.premium,
    experienceTotal: params.experienceTotal,
    nowMs: params.nowMs,
  });

  return {
    userId: product.userId,
    accountLevel: product.accountLevel,
    premiumActive: product.premiumActive,
    premiumTier: product.premiumTier,
    premiumSource: product.premiumSource,
    premiumExpiresAt: product.premiumExpiresAt,
    capabilities: product.capabilities,
  };
}

/** @deprecated Prefer resolveProductEntitlement / premiumTier — kept for call-site clarity. */
export function resolveEffectivePremiumTier(params: {
  premium: PremiumEntitlementSnapshot | null;
  nowMs?: number;
}): PremiumTier {
  return effectivePremiumTier(params);
}

export function hasAudioCapability(
  entitlement: EffectiveAudioEntitlement,
  required: AudioCapabilityKey,
): boolean {
  return entitlement.capabilities.includes(required);
}

export function hasAnyAudioCapability(
  entitlement: EffectiveAudioEntitlement,
  required: readonly AudioCapabilityKey[],
): boolean {
  return required.some((key) => hasAudioCapability(entitlement, key));
}

export function assertAudioCapability(
  entitlement: EffectiveAudioEntitlement,
  required: AudioCapabilityKey,
): void {
  if (!entitlement.userId) {
    throw new AudioEntitlementError(
      "Authentication required for audio capability.",
      "UNAUTHENTICATED",
    );
  }
  if (!hasAudioCapability(entitlement, required)) {
    throw new AudioEntitlementError(
      `Missing audio capability: ${required}`,
      "FORBIDDEN",
    );
  }
}

/**
 * Reject client-supplied premium / capability / limit claims (never trust body/UI).
 */
export function rejectClientChosenPremiumClaims(payload: {
  premium?: unknown;
  premiumActive?: unknown;
  isPremium?: unknown;
  premiumTier?: unknown;
  capabilities?: unknown;
  audioCapabilities?: unknown;
  tier?: unknown;
  qualityTier?: unknown;
  limits?: unknown;
  renderLimits?: unknown;
  downloadsDaily?: unknown;
  publicAudio?: unknown;
  e3PublicAudio?: unknown;
  isPublicAudio?: unknown;
  E3_PUBLIC_AUDIO?: unknown;
}): void {
  const forbidden = [
    "premium",
    "premiumActive",
    "isPremium",
    "premiumTier",
    "capabilities",
    "audioCapabilities",
    "tier",
    "qualityTier",
    "limits",
    "renderLimits",
    "downloadsDaily",
    "publicAudio",
    "e3PublicAudio",
    "isPublicAudio",
    "E3_PUBLIC_AUDIO",
  ] as const;
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new AudioEntitlementError(
        `Client must not supply ${key}; server resolves Premium overlay.`,
        "FORBIDDEN",
      );
    }
  }
}

/** Frozen capability universe — STEMS must remain absent. */
export function isAudioCapabilityKey(value: string): value is AudioCapabilityKey {
  return (AUDIO_CAPABILITY_KEYS as readonly string[]).includes(value);
}
