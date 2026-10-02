import type {
  Far01ChecksumStatus,
  Far01MappedAsset,
  Far01PreflightResult,
  Far01StorageObjectMeta,
} from "./types";
import {
  FAR01_BACKFILL_BUCKET,
  FAR01_BACKFILL_PURPOSE,
  FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES,
} from "./types";
import { rejectArbitraryOrTraversalKey } from "./mapping";

export type Far01PreflightContext = {
  mapped: Far01MappedAsset;
  sourceMeta: Far01StorageObjectMeta;
  destinationMeta: Far01StorageObjectMeta;
  /** Another asset already claims destinationKey in DB */
  destinationClaimedByOtherAssetId: string | null;
  eligibleAssetStatuses?: readonly string[];
};

function checksumStatusFromAsset(
  checksum: string | null,
): Far01ChecksumStatus {
  // OD-BF-02 / C-01: NULL → UNKNOWN, never PASS
  if (checksum == null || checksum === "") {
    return "UNKNOWN";
  }
  return "UNKNOWN"; // presence alone is not PASS until compared post-copy
}

/**
 * Read-only preflight. Never mutates Storage or DB.
 */
export function runFar01Preflight(
  ctx: Far01PreflightContext,
): Far01PreflightResult {
  const {
    mapped,
    sourceMeta,
    destinationMeta,
    destinationClaimedByOtherAssetId,
  } = ctx;
  const eligible =
    ctx.eligibleAssetStatuses ?? FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES;

  const checksumStatus = checksumStatusFromAsset(
    mapped.asset.checksum_sha256,
  );

  if (mapped.alreadyCanonical) {
    return {
      classification: "PASS",
      action: "SKIP",
      reason: "already_canonical",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (!mapped.beat.owner_id) {
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "missing_owner_id",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (mapped.beat.ownership_type !== "USER") {
    return {
      classification: "ANOMALY",
      action: "QUARANTINE",
      reason: "non_user_ownership",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (mapped.asset.storage_bucket !== FAR01_BACKFILL_BUCKET) {
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "wrong_bucket",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (mapped.asset.purpose !== FAR01_BACKFILL_PURPOSE) {
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "wrong_purpose",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (!eligible.includes(mapped.asset.status)) {
    // C-02: bound eligibility — unsupported status → OWNER_REVIEW
    return {
      classification: "ANOMALY",
      action: "OWNER_REVIEW",
      reason: "unsupported_asset_status",
      identityMismatch: false,
      checksumStatus,
    };
  }

  const shapeErr = rejectArbitraryOrTraversalKey(mapped.sourceKey);
  if (shapeErr) {
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "malformed_or_traversal_key",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (!mapped.isLegacyShape) {
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "not_legacy_user_master_shape",
      identityMismatch: false,
      checksumStatus,
    };
  }

  // OD-BF-01: identity mismatch → quarantine, no auto migrate
  if (mapped.identityMismatch) {
    return {
      classification: "ANOMALY",
      action: "QUARANTINE",
      reason: "identity_mismatch",
      identityMismatch: true,
      checksumStatus,
    };
  }

  if (mapped.pathOwnerId && mapped.pathOwnerId !== mapped.ownerId) {
    return {
      classification: "ANOMALY",
      action: "QUARANTINE",
      reason: "wrong_owner",
      identityMismatch: true,
      checksumStatus,
    };
  }

  if (mapped.pathBeatId && mapped.pathBeatId !== mapped.beatId) {
    return {
      classification: "ANOMALY",
      action: "QUARANTINE",
      reason: "wrong_beat",
      identityMismatch: true,
      checksumStatus,
    };
  }

  if (mapped.pathAssetId && mapped.pathAssetId !== mapped.assetId) {
    return {
      classification: "ANOMALY",
      action: "QUARANTINE",
      reason: "wrong_asset",
      identityMismatch: true,
      checksumStatus,
    };
  }

  if (!sourceMeta.exists) {
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "missing_storage",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (destinationClaimedByOtherAssetId) {
    return {
      classification: "ANOMALY",
      action: "QUARANTINE",
      reason: "duplicate_destination",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (destinationMeta.exists) {
    const srcSize = sourceMeta.size;
    const dstSize = destinationMeta.size;
    if (
      srcSize != null &&
      dstSize != null &&
      srcSize === dstSize
    ) {
      // C-03: size-identity only — not cryptographic. Idempotent copy-done.
      return {
        classification: "PASS",
        action: "SKIP",
        reason: "destination_exists_size_match_copy_done",
        identityMismatch: false,
        checksumStatus,
      };
    }
    return {
      classification: "FAIL",
      action: "FAIL",
      reason: "destination_exists_conflict",
      identityMismatch: false,
      checksumStatus,
    };
  }

  if (
    mapped.asset.byte_size != null &&
    sourceMeta.size != null &&
    mapped.asset.byte_size !== sourceMeta.size
  ) {
    return {
      classification: "ANOMALY",
      action: "OWNER_REVIEW",
      reason: "metadata_size_inconsistency",
      identityMismatch: false,
      checksumStatus,
    };
  }

  // checksum NULL remains UNKNOWN (OD-BF-02); still eligible for MIGRATE under size-only policy
  return {
    classification: checksumStatus === "UNKNOWN" ? "UNKNOWN" : "PASS",
    action: "MIGRATE",
    reason:
      checksumStatus === "UNKNOWN"
        ? "eligible_migrate_checksum_unknown"
        : "eligible_migrate",
    identityMismatch: false,
    checksumStatus,
  };
}
