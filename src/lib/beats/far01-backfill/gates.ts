import {
  assertLiveGrantAuthorized,
  isFar01VerifiedLiveGrant,
  type Far01VerifiedLiveGrant,
} from "./attestation";
import { Far01BackfillAuthorizationError } from "./errors";
import type {
  Far01BackfillAuthorization,
  Far01ExecutionMode,
  Far01MappedAsset,
  Far01PreflightResult,
  Far01RollbackPlan,
} from "./types";
import { FAR01_DEFAULT_AUTHORIZATION } from "./types";

export { Far01BackfillAuthorizationError } from "./errors";

/**
 * DEFAULT = NO EXECUTION.
 * LIVE requires OD-ATT-01 A2 verified grant + OD-BF-06 operatorApproval.
 * Plain backfillGo boolean is NOT sufficient (C-IMPL-01).
 */
export function assertLiveExecutionAuthorized(
  auth: Far01BackfillAuthorization = FAR01_DEFAULT_AUTHORIZATION,
  verifiedGrant?: Far01VerifiedLiveGrant | null,
): void {
  assertLiveGrantAuthorized({
    verifiedGrant,
    operatorApproval: auth.operatorApproval,
    legacyBackfillGoBoolean: auth.backfillGo,
  });
}

export function resolveExecutionMode(params: {
  requested: Far01ExecutionMode;
  authorization: Far01BackfillAuthorization;
  verifiedGrant?: Far01VerifiedLiveGrant | null;
}): Far01ExecutionMode {
  if (params.requested === "DRY_RUN") {
    return "DRY_RUN";
  }
  assertLiveExecutionAuthorized(params.authorization, params.verifiedGrant);
  if (!isFar01VerifiedLiveGrant(params.verifiedGrant)) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: verified signed GO grant required (OD-ATT-01 A2)",
    );
  }
  return "LIVE";
}

/**
 * DB UPDATE gate — pure decision. Does not execute SQL.
 * Optimistic lock must use: WHERE id = assetId AND object_key = sourceKey
 */
export function evaluateDbUpdateGate(params: {
  mapped: Far01MappedAsset;
  preflight: Far01PreflightResult;
  postCopyAllowDbUpdate: boolean;
  postCopyReason: string;
}): {
  allow: boolean;
  reason: string;
  optimisticLockSourceKey: string;
  optimisticLockDestKey: string;
} {
  const { mapped, preflight } = params;

  if (preflight.identityMismatch || preflight.action === "QUARANTINE") {
    return {
      allow: false,
      reason: "od_bf_01_quarantine_no_db_mutation",
      optimisticLockSourceKey: mapped.sourceKey,
      optimisticLockDestKey: mapped.destinationKey,
    };
  }
  if (preflight.action === "FAIL" || preflight.action === "OWNER_REVIEW") {
    return {
      allow: false,
      reason: `preflight_${preflight.action.toLowerCase()}`,
      optimisticLockSourceKey: mapped.sourceKey,
      optimisticLockDestKey: mapped.destinationKey,
    };
  }
  if (!params.postCopyAllowDbUpdate) {
    return {
      allow: false,
      reason: params.postCopyReason,
      optimisticLockSourceKey: mapped.sourceKey,
      optimisticLockDestKey: mapped.destinationKey,
    };
  }
  return {
    allow: true,
    reason: "db_update_gate_pass",
    optimisticLockSourceKey: mapped.sourceKey,
    optimisticLockDestKey: mapped.destinationKey,
  };
}

/** OD-BF-04 rollback plan — never deletes source. */
export function planFar01Rollback(params: {
  assetId: string;
  legacyObjectKey: string;
  currentObjectKey: string;
  legacySourceExists: boolean;
}): Far01RollbackPlan {
  if (!params.legacySourceExists) {
    return {
      asset_id: params.assetId,
      canRevert: false,
      reason: "legacy_source_missing_cannot_revert_safely",
      legacy_object_key: params.legacyObjectKey,
      current_object_key: params.currentObjectKey,
      source_must_exist: true,
    };
  }
  if (params.currentObjectKey === params.legacyObjectKey) {
    return {
      asset_id: params.assetId,
      canRevert: false,
      reason: "already_on_legacy_key",
      legacy_object_key: params.legacyObjectKey,
      current_object_key: params.currentObjectKey,
      source_must_exist: true,
    };
  }
  return {
    asset_id: params.assetId,
    canRevert: true,
    reason: "revert_object_key_to_legacy_while_source_retained",
    legacy_object_key: params.legacyObjectKey,
    current_object_key: params.currentObjectKey,
    source_must_exist: true,
  };
}

export function buildOptimisticLockUpdateSql(): string {
  return [
    "UPDATE beat_audio_assets",
    "SET object_key = $1, updated_at = now()",
    "WHERE id = $2",
    "  AND object_key = $3",
    "  AND storage_bucket = 'beat-audio'",
  ].join("\n");
}
