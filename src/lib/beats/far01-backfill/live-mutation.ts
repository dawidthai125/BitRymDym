/**
 * FAR-01 gated LIVE single-asset mutation (GC-MUT ordering).
 *
 * Order (must not reverse):
 *   SOURCE RE-HEAD → DESTINATION RE-HEAD → COPY → DESTINATION VERIFY
 *   → DB RE-HEAD → OPTIMISTIC DB UPDATE → DB VERIFY
 *
 * Fail closed on missing LIVE auth, wrong mode, quarantine, identity,
 * destination present, source drift. No automatic cleanup / rollback.
 */

import { buildUserBeatAudioObjectKey } from "@/lib/beats/audio-validation";

import {
  assertLiveGrantAuthorized,
  isFar01VerifiedLiveGrant,
  type Far01VerifiedLiveGrant,
} from "./attestation";
import { Far01BackfillAuthorizationError, Far01MutationGateError } from "./errors";
import { evaluateDbUpdateGate } from "./gates";
import { evaluatePostCopyIntegrity } from "./integrity";
import {
  postCopyReHeadVerify,
  preMutationHeadCheck,
  type Far01DbMutator,
  type Far01StorageInspector,
  type Far01StorageMutator,
} from "./mutators";
import { isFar01LockedQuarantineAssetId } from "./quarantine";
import { FAR01_BACKFILL_PURPOSE } from "./types";
import type {
  Far01BackfillAuthorization,
  Far01DbUpdateStatus,
  Far01ExecutionMode,
  Far01IntegrityClass,
  Far01MappedAsset,
  Far01PreflightResult,
} from "./types";

export type Far01LiveMutationResult = {
  dbUpdateStatus: Far01DbUpdateStatus;
  status: Far01IntegrityClass;
  reason: string;
  sourceSize: number | null;
  destinationSize: number | null;
  sizeMatch: boolean | null;
  copied: boolean;
};

/**
 * Assert identity binding + deterministic destination before any mutation.
 */
export function assertFar01MutationIdentityGate(mapped: Far01MappedAsset): void {
  if (isFar01LockedQuarantineAssetId(mapped.assetId)) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: asset is LOCKED QUARANTINE (OD-BF-01)",
    );
  }
  if (mapped.alreadyCanonical) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: asset already canonical — SKIP",
    );
  }
  if (!mapped.isLegacyShape) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: source is not legacy USER MASTER shape",
    );
  }
  if (mapped.identityMismatch) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: identity mismatch — QUARANTINE, no COPY (OD-BF-01)",
    );
  }
  if (mapped.beat.owner_id == null || mapped.beat.owner_id !== mapped.ownerId) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: owner_id mismatch",
    );
  }
  if (mapped.beat.id !== mapped.beatId || mapped.asset.beat_id !== mapped.beatId) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: beat_id mismatch",
    );
  }
  if (mapped.asset.id !== mapped.assetId) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: asset.id mismatch",
    );
  }
  if (mapped.asset.object_key !== mapped.sourceKey) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: current object_key !== mapped sourceKey",
    );
  }

  const expectedCanonical = buildUserBeatAudioObjectKey({
    ownerId: mapped.ownerId,
    beatId: mapped.beatId,
    assetId: mapped.assetId,
    purpose: FAR01_BACKFILL_PURPOSE,
  });
  if (mapped.destinationKey !== expectedCanonical) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: arbitrary / non-deterministic destination key",
    );
  }
}

export function assertFar01LiveMutationAuthorized(params: {
  mode: Far01ExecutionMode;
  verifiedGrant: Far01VerifiedLiveGrant | null | undefined;
  authorization: Far01BackfillAuthorization;
}): void {
  if (params.mode !== "LIVE") {
    throw new Far01BackfillAuthorizationError(
      "LIVE mutation denied: mode must be LIVE",
    );
  }
  assertLiveGrantAuthorized({
    verifiedGrant: params.verifiedGrant,
    operatorApproval: params.authorization.operatorApproval,
    legacyBackfillGoBoolean: params.authorization.backfillGo,
  });
  if (!isFar01VerifiedLiveGrant(params.verifiedGrant)) {
    throw new Far01BackfillAuthorizationError(
      "LIVE mutation denied: verified A2 grant required",
    );
  }
}

/**
 * Execute gated LIVE mutation for one mapped asset.
 * Storage COPY failure → no DB update. DB failure → source retained.
 */
export async function executeFar01LiveAssetMutation(params: {
  mode: Far01ExecutionMode;
  verifiedGrant: Far01VerifiedLiveGrant | null | undefined;
  authorization: Far01BackfillAuthorization;
  mapped: Far01MappedAsset;
  preflight: Far01PreflightResult;
  expectedSourceSize: number | null;
  storageMutator: Far01StorageMutator;
  storageInspector: Far01StorageInspector;
  dbMutator: Far01DbMutator;
}): Promise<Far01LiveMutationResult> {
  assertFar01LiveMutationAuthorized({
    mode: params.mode,
    verifiedGrant: params.verifiedGrant,
    authorization: params.authorization,
  });

  if (params.preflight.action === "QUARANTINE" || params.preflight.identityMismatch) {
    throw new Far01MutationGateError(
      "LIVE mutation denied: preflight QUARANTINE / identity mismatch (OD-BF-01)",
    );
  }
  if (params.preflight.action !== "MIGRATE") {
    throw new Far01MutationGateError(
      `LIVE mutation denied: preflight action=${params.preflight.action}`,
    );
  }

  assertFar01MutationIdentityGate(params.mapped);

  const bucket = params.mapped.asset.storage_bucket;

  // SOURCE RE-HEAD → DESTINATION RE-HEAD (hard stop if dest present)
  const preHead = await preMutationHeadCheck({
    inspector: params.storageInspector,
    bucket,
    sourceKey: params.mapped.sourceKey,
    destinationKey: params.mapped.destinationKey,
    expectedSourceSize: params.expectedSourceSize,
  });

  // COPY (upsert:false)
  await params.storageMutator.copyObject({
    bucket,
    sourceKey: params.mapped.sourceKey,
    destinationKey: params.mapped.destinationKey,
    upsert: false,
  });

  // DESTINATION VERIFY (+ source retained check)
  const reHead = await postCopyReHeadVerify({
    inspector: params.storageInspector,
    bucket,
    sourceKey: params.mapped.sourceKey,
    destinationKey: params.mapped.destinationKey,
    expectedSize: preHead.source.size,
  });

  const integrity = evaluatePostCopyIntegrity({
    sourceExists: reHead.source.exists,
    destinationExists: reHead.destination.exists,
    sourceSize: reHead.source.size,
    destinationSize: reHead.destination.size,
    sourceChecksum: params.mapped.asset.checksum_sha256,
    destinationChecksum: params.mapped.asset.checksum_sha256,
    identityMismatch: false,
  });

  const gate = evaluateDbUpdateGate({
    mapped: params.mapped,
    preflight: params.preflight,
    postCopyAllowDbUpdate: integrity.allowDbUpdate,
    postCopyReason: integrity.reason,
  });

  if (!gate.allow) {
    return {
      dbUpdateStatus: "BLOCKED",
      status: integrity.status,
      reason: gate.reason,
      sourceSize: reHead.source.size,
      destinationSize: reHead.destination.size,
      sizeMatch: integrity.sizeMatch,
      copied: true,
    };
  }

  // DB RE-HEAD → OPTIMISTIC UPDATE → DB VERIFY (inside prod db mutator)
  const upd = await params.dbMutator.updateObjectKeyOptimistic({
    assetId: params.mapped.assetId,
    sourceKey: gate.optimisticLockSourceKey,
    destinationKey: gate.optimisticLockDestKey,
  });

  if (upd.rowsAffected !== 1) {
    return {
      dbUpdateStatus: "FAIL",
      status: "FAIL",
      reason: "optimistic_lock_failed",
      sourceSize: reHead.source.size,
      destinationSize: reHead.destination.size,
      sizeMatch: integrity.sizeMatch,
      copied: true,
    };
  }

  return {
    dbUpdateStatus: "SUCCESS",
    status: integrity.status,
    reason: "live_mutation_success",
    sourceSize: reHead.source.size,
    destinationSize: reHead.destination.size,
    sizeMatch: integrity.sizeMatch,
    copied: true,
  };
}
