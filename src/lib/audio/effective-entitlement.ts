/**
 * E3.2 — Effective audio entitlement resolver (server SSOT).
 * Premium = paid overlay from premium_entitlements (OAD-01).
 * Account Level ≠ Premium. Role ≠ Premium. No PremiumAudioRole.
 * Recording limits stay in takes/entitlement.ts — do not merge.
 */

import {
  AUDIO_CAPABILITY_KEYS,
  type AudioCapabilityKey,
} from "@/config/audio-render";
import type { AccountLevel } from "@/types/domain";

/** Free authenticated baseline (Final Lock / Impl Plan §10). */
export const FREE_AUDIO_CAPABILITIES = [
  "MIX_BASIC",
  "MASTER_BASIC",
  "EXPORT_BASIC_MP3",
] as const satisfies readonly AudioCapabilityKey[];

/** Premium overlay additions (only when premiumActive). */
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
};

export type EffectiveAudioEntitlement = {
  userId: string | null;
  accountLevel: AccountLevel | null;
  /** true only when overlay row is active and not past expires_at. */
  premiumActive: boolean;
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

function capabilitiesForPremiumActive(
  premiumActive: boolean,
): readonly AudioCapabilityKey[] {
  if (!premiumActive) return FREE_AUDIO_CAPABILITIES;
  return [...FREE_AUDIO_CAPABILITIES, ...PREMIUM_AUDIO_CAPABILITIES];
}

/**
 * Pure effective entitlement. Does not read DB / client flags / Account Level as Premium.
 * Anonymous (no userId) → zero audio capabilities.
 */
export function resolveEffectiveAudioEntitlement(params: {
  userId: string | null;
  accountLevel: AccountLevel | null;
  premium: PremiumEntitlementSnapshot | null;
  nowMs?: number;
}): EffectiveAudioEntitlement {
  const nowMs = params.nowMs ?? Date.now();

  if (!params.userId) {
    return {
      userId: null,
      accountLevel: params.accountLevel,
      premiumActive: false,
      premiumSource: null,
      premiumExpiresAt: null,
      capabilities: [],
    };
  }

  const premiumMatchesUser =
    params.premium != null && params.premium.userId === params.userId
      ? params.premium
      : null;

  const premiumActive = isPremiumEntitlementActive(premiumMatchesUser, nowMs);

  return {
    userId: params.userId,
    accountLevel: params.accountLevel,
    premiumActive,
    premiumSource: premiumActive
      ? (premiumMatchesUser?.source ?? null)
      : null,
    premiumExpiresAt: premiumMatchesUser?.expiresAt ?? null,
    capabilities: capabilitiesForPremiumActive(premiumActive),
  };
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
 * Reject client-supplied premium / capability claims (never trust body/UI).
 */
export function rejectClientChosenPremiumClaims(payload: {
  premium?: unknown;
  premiumActive?: unknown;
  isPremium?: unknown;
  capabilities?: unknown;
  audioCapabilities?: unknown;
  tier?: unknown;
  qualityTier?: unknown;
  publicAudio?: unknown;
  e3PublicAudio?: unknown;
  isPublicAudio?: unknown;
  E3_PUBLIC_AUDIO?: unknown;
}): void {
  const forbidden = [
    "premium",
    "premiumActive",
    "isPremium",
    "capabilities",
    "audioCapabilities",
    "tier",
    "qualityTier",
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
