import {
  buildLegacyUserBeatMasterObjectKey,
  buildUserBeatAudioObjectKey,
  validateObjectKey,
} from "@/lib/beats/audio-validation";

import type {
  Far01AssetSnapshot,
  Far01BeatSnapshot,
  Far01MappedAsset,
} from "./types";
import { FAR01_BACKFILL_BUCKET, FAR01_BACKFILL_PURPOSE } from "./types";

const LEGACY_USER_MASTER_RE =
  /^user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/master\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.bin$/i;

const CANONICAL_USER_MASTER_RE =
  /^user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/master\.bin$/i;

export function isLegacyUserMasterObjectKey(objectKey: string): boolean {
  return LEGACY_USER_MASTER_RE.test(objectKey);
}

export function isCanonicalUserMasterObjectKey(objectKey: string): boolean {
  return CANONICAL_USER_MASTER_RE.test(objectKey);
}

export function parseLegacyUserMasterPath(objectKey: string): {
  ownerId: string;
  beatId: string;
  pathAssetId: string;
} | null {
  const m = objectKey.match(LEGACY_USER_MASTER_RE);
  if (!m) return null;
  return { ownerId: m[1]!, beatId: m[2]!, pathAssetId: m[3]! };
}

/**
 * PATH ≠ AUTHORIZATION.
 * Destination always from DB identities; source always stored object_key.
 */
export function mapFar01BackfillAsset(params: {
  asset: Far01AssetSnapshot;
  beat: Far01BeatSnapshot;
}): Far01MappedAsset {
  const { asset, beat } = params;
  const ownerId = beat.owner_id ?? "";
  const beatId = beat.id;
  const assetId = asset.id;
  const sourceKey = asset.object_key;

  const destinationKey = buildUserBeatAudioObjectKey({
    ownerId,
    beatId,
    assetId,
    purpose: FAR01_BACKFILL_PURPOSE,
  });

  const expectedLegacyTwin = buildLegacyUserBeatMasterObjectKey({
    ownerId,
    beatId,
    assetId,
  });

  const parsed = parseLegacyUserMasterPath(sourceKey);
  const alreadyCanonical = isCanonicalUserMasterObjectKey(sourceKey);
  const isLegacyShape = isLegacyUserMasterObjectKey(sourceKey);

  const identityMismatch =
    isLegacyShape &&
    (sourceKey !== expectedLegacyTwin ||
      parsed?.pathAssetId.toLowerCase() !== assetId.toLowerCase() ||
      parsed?.beatId.toLowerCase() !== beatId.toLowerCase() ||
      parsed?.ownerId.toLowerCase() !== ownerId.toLowerCase());

  return {
    asset,
    beat,
    ownerId,
    beatId,
    assetId,
    sourceKey,
    destinationKey,
    expectedLegacyTwin,
    pathOwnerId: parsed?.ownerId ?? null,
    pathBeatId: parsed?.beatId ?? null,
    pathAssetId: parsed?.pathAssetId ?? null,
    identityMismatch,
    alreadyCanonical,
    isLegacyShape,
  };
}

export function assertNoClientObjectKeyAuthority(params: {
  clientObjectKey?: string | null;
}): void {
  if (params.clientObjectKey != null && params.clientObjectKey !== "") {
    throw new Error("Client must not supply object_key as migration authority.");
  }
}

export function rejectArbitraryOrTraversalKey(objectKey: string): string | null {
  if (objectKey.includes("..") || objectKey.includes("//")) {
    return "object key must not contain path traversal";
  }
  return validateObjectKey(objectKey);
}

export function isFar01BackfillBucket(bucket: string): boolean {
  return bucket === FAR01_BACKFILL_BUCKET;
}
