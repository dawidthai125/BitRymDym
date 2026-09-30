/**
 * AC-PE-12 / F-PE-02 — Public Free Audio runtime AuthZ gate (OD-E3-PE-03).
 * Additive fail-closed gate. Does not replace entitlement / ownership / tier AuthZ.
 * Premium never depends on E3_PUBLIC_AUDIO.
 */

import "server-only";

import { isE3PublicAudioAuthorized } from "@/config/audio-render";
import type { EffectiveAudioEntitlement } from "@/lib/audio/effective-entitlement";

export class PublicAudioGateError extends Error {
  readonly code: "DISABLED" = "DISABLED";
  constructor(message: string) {
    super(message);
    this.name = "PublicAudioGateError";
  }
}

/**
 * Pure rule for unit tests — do not read env here.
 * Premium → released. Free → only when publicAudioAuthorized === true.
 */
export function isPublicFreeAudioReleasedFor(
  entitlement: EffectiveAudioEntitlement,
  publicAudioAuthorized: boolean,
): boolean {
  if (entitlement.premiumActive === true) return true;
  return publicAudioAuthorized === true;
}

/**
 * Fail-closed: OFF / UNSET / invalid → Free DENY.
 * Premium skip. Server env SSOT via isE3PublicAudioAuthorized().
 */
export function assertPublicFreeAudioReleased(
  entitlement: EffectiveAudioEntitlement,
): void {
  if (
    !isPublicFreeAudioReleasedFor(entitlement, isE3PublicAudioAuthorized())
  ) {
    throw new PublicAudioGateError(
      "Public Free Audio is not released (E3_PUBLIC_AUDIO=OFF).",
    );
  }
}
