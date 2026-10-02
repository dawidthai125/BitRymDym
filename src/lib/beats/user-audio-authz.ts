import type { Beat, BeatStatus } from "@/types/domain";
import type { AuthContext } from "@/lib/auth/types";
import { assertUserBeatObjectKeyBinding } from "@/lib/beats/audio-validation";
import type { BeatAudioAssetRow } from "@/lib/beats/audio-types";

export class UserAudioAuthzError extends Error {
  readonly code: "FORBIDDEN" | "NOT_FOUND" = "FORBIDDEN";
  constructor(message: string, code: "FORBIDDEN" | "NOT_FOUND" = "FORBIDDEN") {
    super(message);
    this.name = "UserAudioAuthzError";
    this.code = code;
  }
}

/**
 * Pure AuthZ: USER may only transport audio for own USER DRAFT / REJECTED beats.
 * Wave 3: REJECTED rework may replace MASTER before return-to-DRAFT + resubmit.
 */
export function assertUserDraftTransportAccess(params: {
  context: AuthContext;
  beat: {
    id: string;
    ownershipType: string;
    ownerId: string | null;
    status: BeatStatus | string;
  };
}): void {
  if (params.context.profile.role !== "USER") {
    throw new UserAudioAuthzError(
      "Community audio transport is for USER role only.",
    );
  }
  if (!params.context.permissions.includes("beats.create")) {
    throw new UserAudioAuthzError("Missing permission.");
  }
  if (params.beat.ownershipType !== "USER") {
    throw new UserAudioAuthzError(
      "USER may only upload to USER-owned beats.",
    );
  }
  if (params.beat.ownerId !== params.context.userId) {
    throw new UserAudioAuthzError("Not beat owner.");
  }
  if (params.beat.status !== "DRAFT" && params.beat.status !== "REJECTED") {
    throw new UserAudioAuthzError(
      "USER audio upload allowed only while beat is DRAFT or REJECTED.",
    );
  }
}

export function assertUserAssetBinding(params: {
  context: AuthContext;
  beat: Beat | { id: string; ownerId: string | null; ownershipType: string };
  asset: BeatAudioAssetRow;
  beatId: string;
  assetId: string;
}): void {
  if (params.asset.id !== params.assetId) {
    throw new UserAudioAuthzError("Asset id mismatch.");
  }
  if (params.asset.beat_id !== params.beatId) {
    throw new UserAudioAuthzError("Asset does not belong to beat.");
  }
  if (params.beat.id !== params.beatId) {
    throw new UserAudioAuthzError("Beat id mismatch.");
  }
  if (params.asset.purpose !== "MASTER") {
    throw new UserAudioAuthzError("Expected MASTER asset.");
  }
  if (params.asset.storage_bucket !== "beat-audio") {
    throw new UserAudioAuthzError("Invalid storage bucket.");
  }

  // AuthZ identities from beat/asset context (DB), never from parsing object_key.
  const ownerId = params.beat.ownerId ?? params.context.userId;
  if (!ownerId) {
    throw new UserAudioAuthzError("USER beat must have an owner.");
  }

  // FAR-01 DR-A: shared dual-accept (canonical OR deterministic legacy twin).
  const keyCheck = assertUserBeatObjectKeyBinding({
    objectKey: params.asset.object_key,
    ownerId,
    beatId: params.beatId,
    assetId: params.assetId,
  });
  if (!keyCheck.ok) {
    throw new UserAudioAuthzError(keyCheck.error);
  }
}

/** Deny client-supplied path / owner / bucket spoofing inputs. */
export function rejectClientChosenStorageParams(params: {
  objectKey?: string | null;
  ownerId?: string | null;
  bucket?: string | null;
  assetId?: string | null;
}): void {
  if (params.objectKey != null && params.objectKey !== "") {
    throw new UserAudioAuthzError("Client must not choose object key.");
  }
  if (params.ownerId != null && params.ownerId !== "") {
    throw new UserAudioAuthzError("Client must not choose ownerId.");
  }
  if (params.bucket != null && params.bucket !== "") {
    throw new UserAudioAuthzError("Client must not choose bucket.");
  }
}
