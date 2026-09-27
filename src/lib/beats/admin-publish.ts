import type {
  BeatAudioAssetStatus,
  BeatAudioPurpose,
  BeatOwnershipType,
  BeatStatus,
} from "@/types/domain";

/** Shared publish-blocked copy (UI + server). */
export const PUBLISH_REQUIRES_READY_MASTER =
  "Publikacja zablokowana: wymagany aktywny MASTER w statusie READY.";

export const PUBLISH_REQUIRES_PLATFORM =
  "Publikacja dostępna tylko dla PLATFORM beats.";

export const PUBLISH_REQUIRES_DRAFT =
  "Publikacja dostępna tylko ze statusu DRAFT.";

export const PUBLISH_REQUIRES_APPROVED =
  "Publikacja community wymaga statusu APPROVED.";

export const PUBLISH_USER_FROM_DRAFT_DENIED =
  "USER beats cannot publish from DRAFT.";

/**
 * Wave 4 UI gate — USER APPROVED + active MASTER READY (no metadata edit).
 */
export function getCommunityPublishGate(params: {
  status: BeatStatus;
  ownershipType: BeatOwnershipType;
  activeMasterReady: boolean;
}): { enabled: boolean; blockedReason: string | null } {
  if (params.ownershipType !== "USER") {
    return {
      enabled: false,
      blockedReason: PUBLISH_REQUIRES_PLATFORM,
    };
  }
  if (params.status !== "APPROVED") {
    return {
      enabled: false,
      blockedReason:
        params.status === "PUBLISHED"
          ? "Bit jest już opublikowany."
          : PUBLISH_REQUIRES_APPROVED,
    };
  }
  if (!params.activeMasterReady) {
    return {
      enabled: false,
      blockedReason: PUBLISH_REQUIRES_READY_MASTER,
    };
  }
  return { enabled: true, blockedReason: null };
}

export function canCommunityPublishFromUi(params: {
  status: BeatStatus;
  ownershipType: BeatOwnershipType;
  activeMasterReady: boolean;
}): boolean {
  return getCommunityPublishGate(params).enabled;
}

/**
 * Phase 1.7 UI publish gate — PLATFORM DRAFT path (preserved).
 * Server hard gate: {@link assertPublishHardGate}.
 */
export function getAdminPublishGate(params: {
  status: BeatStatus;
  activeMasterReady: boolean;
}): { enabled: boolean; blockedReason: string | null } {
  if (params.status !== "DRAFT") {
    return {
      enabled: false,
      blockedReason:
        params.status === "PUBLISHED"
          ? "Bit jest już opublikowany."
          : `Publikacja niedostępna w statusie ${params.status}.`,
    };
  }

  if (!params.activeMasterReady) {
    return {
      enabled: false,
      blockedReason: PUBLISH_REQUIRES_READY_MASTER,
    };
  }

  return { enabled: true, blockedReason: null };
}

export function canAdminPublishFromUi(params: {
  status: BeatStatus;
  activeMasterReady: boolean;
}): boolean {
  return getAdminPublishGate(params).enabled;
}

/** Asset snapshot used by the server hard gate (DB-sourced; never trust client). */
export type PublishGateAssetSnapshot = {
  id: string;
  beatId: string;
  purpose: BeatAudioPurpose;
  status: BeatAudioAssetStatus;
  isActive: boolean;
};

export type PublishHardGateInput = {
  beatId: string;
  ownershipType: BeatOwnershipType;
  status: BeatStatus;
  /** Assets loaded for this beatId only (caller must filter by beat_id). */
  assetsForBeat: readonly PublishGateAssetSnapshot[];
};

export type PublishHardGateResult =
  | { ok: true; readyMasterAssetId: string }
  | { ok: false; reason: string };

/** @deprecated Use PublishHardGateInput */
export type PlatformPublishHardGateInput = PublishHardGateInput;
/** @deprecated Use PublishHardGateResult */
export type PlatformPublishHardGateResult = PublishHardGateResult;

function findActiveMasterReady(
  params: PublishHardGateInput,
): string | null {
  const readyMasters = params.assetsForBeat.filter(
    (asset) =>
      asset.beatId === params.beatId &&
      asset.purpose === "MASTER" &&
      asset.isActive &&
      asset.status === "READY",
  );
  return readyMasters[0]?.id ?? null;
}

/**
 * Ownership-aware publish hard gate (Community Wave 1).
 *
 * PLATFORM: DRAFT → PUBLISHED requires active MASTER READY
 * USER: APPROVED → PUBLISHED requires active MASTER READY
 * USER from DRAFT / PENDING_REVIEW / REJECTED → DENY
 */
export function assertPublishHardGate(
  params: PublishHardGateInput,
): PublishHardGateResult {
  if (params.ownershipType === "PLATFORM") {
    if (params.status !== "DRAFT") {
      return { ok: false, reason: PUBLISH_REQUIRES_DRAFT };
    }
  } else if (params.ownershipType === "USER") {
    if (params.status === "DRAFT") {
      return { ok: false, reason: PUBLISH_USER_FROM_DRAFT_DENIED };
    }
    if (params.status !== "APPROVED") {
      return { ok: false, reason: PUBLISH_REQUIRES_APPROVED };
    }
  } else {
    return { ok: false, reason: PUBLISH_REQUIRES_PLATFORM };
  }

  const readyId = findActiveMasterReady(params);
  if (!readyId) {
    return { ok: false, reason: PUBLISH_REQUIRES_READY_MASTER };
  }

  return { ok: true, readyMasterAssetId: readyId };
}

/**
 * @deprecated Prefer {@link assertPublishHardGate}. Kept for PLATFORM-call-site compatibility.
 */
export function assertPlatformPublishHardGate(
  params: PublishHardGateInput,
): PublishHardGateResult {
  return assertPublishHardGate(params);
}

/** Whether an asset row qualifies as active MASTER READY for a beat. */
export function isActiveMasterReadyForBeat(params: {
  beatId: string;
  asset: PublishGateAssetSnapshot;
}): boolean {
  return (
    params.asset.beatId === params.beatId &&
    params.asset.purpose === "MASTER" &&
    params.asset.isActive &&
    params.asset.status === "READY"
  );
}
