/**
 * E3.3 — Mix AuthZ (server). Reuses E3.2 entitlement + take ownership + beat Playback Gate.
 */

import "server-only";

import { E3_MIX_ENABLED } from "@/config/audio-render";
import type { AuthContext } from "@/lib/auth/types";
import {
  assertAudioCapability,
  type EffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  PublicAudioGateError,
  assertPublicFreeAudioReleased,
} from "@/lib/audio/public-audio-gate";
import {
  MixAuthzError,
  assertMixBeatPlaybackAccess,
  assertOwnMixSession,
  masterBasicAllowed,
  masterProAllowed,
  mixProAllowed,
  sanitizeMixClientClaims,
  toHttpStatus,
} from "@/lib/mix/authz-core";
import {
  assertOwnReadyTakeAccess,
  type TakeAccessRow,
} from "@/lib/takes/take-access";

export {
  MixAuthzError,
  assertMixBeatPlaybackAccess,
  assertOwnMixSession,
  masterBasicAllowed,
  masterProAllowed,
  mixProAllowed,
  sanitizeMixClientClaims,
  toHttpStatus,
};

export function assertMixRuntimeEnabled(): void {
  if (E3_MIX_ENABLED !== true) {
    throw new MixAuthzError(
      "Mix is not enabled (E3_MIX_ENABLED=OFF).",
      "DISABLED",
    );
  }
}

export async function resolveMixEntitlement(
  context: AuthContext,
): Promise<EffectiveAudioEntitlement> {
  const entitlement = await resolveAudioEntitlementForAuthContext(context);
  assertAudioCapability(entitlement, "MIX_BASIC");
  // AC-PE-12 — Free public Mix release kill switch (AR-PA-02: create/read/patch/preview).
  try {
    assertPublicFreeAudioReleased(entitlement);
  } catch (error) {
    if (error instanceof PublicAudioGateError) {
      throw new MixAuthzError(error.message, "DISABLED");
    }
    throw error;
  }
  return entitlement;
}

export function assertMixTakeAccess(params: {
  take: TakeAccessRow;
  userId: string;
  expectedBeatId: string;
}): void {
  assertOwnReadyTakeAccess({
    take: params.take,
    userId: params.userId,
    purpose: "preview",
  });
  if (params.take.beat_id !== params.expectedBeatId) {
    throw new MixAuthzError(
      "Take does not belong to the requested beat.",
      "FORBIDDEN",
    );
  }
}
