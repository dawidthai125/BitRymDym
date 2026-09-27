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

/**
 * Phase 1.7 UI publish gate — preserved.
 * Server hard gate: {@link assertPlatformPublishHardGate} (GAP-PUBLISH-READY CLOSED).
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

export type PlatformPublishHardGateInput = {
  beatId: string;
  ownershipType: BeatOwnershipType;
  status: BeatStatus;
  /** Assets loaded for this beatId only (caller must filter by beat_id). */
  assetsForBeat: readonly PublishGateAssetSnapshot[];
};

export type PlatformPublishHardGateResult =
  | { ok: true; readyMasterAssetId: string }
  | { ok: false; reason: string };

/**
 * Server SSOT: PLATFORM DRAFT → PUBLISHED requires an active MASTER READY
 * whose beat_id matches the beat being published.
 */
export function assertPlatformPublishHardGate(
  params: PlatformPublishHardGateInput,
): PlatformPublishHardGateResult {
  if (params.ownershipType !== "PLATFORM") {
    return { ok: false, reason: PUBLISH_REQUIRES_PLATFORM };
  }

  if (params.status !== "DRAFT") {
    return { ok: false, reason: PUBLISH_REQUIRES_DRAFT };
  }

  const readyMasters = params.assetsForBeat.filter(
    (asset) =>
      asset.beatId === params.beatId &&
      asset.purpose === "MASTER" &&
      asset.isActive &&
      asset.status === "READY",
  );

  if (readyMasters.length === 0) {
    return { ok: false, reason: PUBLISH_REQUIRES_READY_MASTER };
  }

  return { ok: true, readyMasterAssetId: readyMasters[0]!.id };
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
