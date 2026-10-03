/**
 * E3.3 — pure Mix AuthZ helpers (no server-only; safe for unit tests).
 */

import {
  hasAudioCapability,
  rejectClientChosenPremiumClaims,
  type EffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import { canRequestBeatAudioAccess } from "@/lib/beats/audio-validation";
import type { SystemRole } from "@/types/domain";

export class MixAuthzError extends Error {
  readonly code: "FORBIDDEN" | "UNAUTHENTICATED" | "NOT_FOUND" | "DISABLED";
  constructor(
    message: string,
    code: MixAuthzError["code"] = "FORBIDDEN",
  ) {
    super(message);
    this.name = "MixAuthzError";
    this.code = code;
  }
}

export function assertOwnMixSession(params: {
  sessionOwnerId: string;
  userId: string;
}): void {
  if (params.sessionOwnerId !== params.userId) {
    throw new MixAuthzError("Not mix session owner.", "FORBIDDEN");
  }
}

export function assertMixBeatPlaybackAccess(params: {
  beatStatus: string;
  actorRole: SystemRole;
}): void {
  const actor =
    params.actorRole === "ADMIN"
      ? "ADMIN"
      : params.actorRole === "MODERATOR"
        ? "MODERATOR"
        : "USER";
  if (
    !canRequestBeatAudioAccess({
      actor,
      beatStatus: params.beatStatus,
      purpose: "PLAYBACK",
    })
  ) {
    throw new MixAuthzError("Beat is not available for Mix playback.", "FORBIDDEN");
  }
}

export function mixProAllowed(entitlement: EffectiveAudioEntitlement): boolean {
  return hasAudioCapability(entitlement, "MIX_PRO");
}

export function masterBasicAllowed(
  entitlement: EffectiveAudioEntitlement,
): boolean {
  return hasAudioCapability(entitlement, "MASTER_BASIC");
}

/** MASTER_PRO recognition only in E3.4 (metering / locked CTA — no Pro DSP params). */
export function masterProAllowed(
  entitlement: EffectiveAudioEntitlement,
): boolean {
  return hasAudioCapability(entitlement, "MASTER_PRO");
}

/** Reject client spoof fields before any Mix write. */
export function sanitizeMixClientClaims(body: Record<string, unknown>): void {
  rejectClientChosenPremiumClaims(body);
  for (const key of [
    "ownerId",
    "userId",
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
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new MixAuthzError(
        `Client must not supply ${key}.`,
        "FORBIDDEN",
      );
    }
  }
}

type CodedError = Error & { code?: string };

export function toHttpStatus(error: CodedError): number {
  if (error instanceof MixAuthzError) {
    if (error.code === "UNAUTHENTICATED") return 401;
    if (error.code === "NOT_FOUND") return 404;
    if (error.code === "DISABLED") return 403;
    return 403;
  }
  if (error.code === "UNAUTHENTICATED") return 401;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "FORBIDDEN") return 403;
  return 400;
}
