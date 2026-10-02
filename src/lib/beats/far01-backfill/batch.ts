import type { Far01VerifiedLiveGrant } from "./attestation";
import {
  assertFleetPhaseAllowed,
  assertNoImplicitUnlimited,
  assertPipelinePhaseOrder,
  type Far01PipelinePhase,
  type Far01VerifiedCanaryResult,
  validateCanaryLimit,
} from "./canary";
import { Far01BackfillAuthorizationError } from "./errors";
import { evaluatePostCopyIntegrity } from "./integrity";
import { evaluateDbUpdateGate, resolveExecutionMode } from "./gates";
import { mapFar01BackfillAsset } from "./mapping";
import {
  denyDbMutator,
  denyStorageMutator,
  postCopyReHeadVerify,
  preMutationHeadCheck,
  type Far01DbMutator,
  type Far01StorageInspector,
  type Far01StorageMutator,
} from "./mutators";
import { runFar01Preflight } from "./preflight";
import {
  buildAssetTelemetry,
  createBatchId,
  sortAssetsForBatch,
  summarizeBatch,
} from "./telemetry";
import type {
  Far01BackfillAuthorization,
  Far01BackfillCandidate,
  Far01BatchSummary,
  Far01ExecutionMode,
} from "./types";
import { FAR01_DEFAULT_AUTHORIZATION } from "./types";

export type { Far01BackfillCandidate } from "./types";
export type {
  Far01DbMutator,
  Far01StorageInspector,
  Far01StorageMutator,
} from "./mutators";

export type Far01BatchRunOptions = {
  mode: Far01ExecutionMode;
  /**
   * Required for LIVE — opaque grant from verifyFar01SignedGoArtifact.
   * Plain authorization.backfillGo is NOT sufficient (OD-ATT-01 A2).
   */
  verifiedGrant?: Far01VerifiedLiveGrant | null;
  authorization?: Far01BackfillAuthorization;
  /**
   * Required for LIVE (and when applying canary truncation).
   * null/undefined DENY on LIVE (OD-CANARY-N).
   * DRY_RUN may omit for full-inventory report (OD-DRYRUN-01).
   */
  canaryLimit?: number | null;
  /** Pipeline phase — FLEET requires verified canary. */
  pipelinePhase?: Far01PipelinePhase;
  verifiedCanary?: Far01VerifiedCanaryResult | null;
  batchId?: string;
  storageMutator?: Far01StorageMutator;
  storageInspector?: Far01StorageInspector;
  dbMutator?: Far01DbMutator;
  shouldAbort?: () => boolean;
};

/**
 * Run FAR-01 backfill batch.
 * DRY_RUN: preflight + telemetry only (zero mutations).
 * LIVE: verified signed grant + operator approval + mutators + inspector re-HEAD.
 */
export async function runFar01BackfillBatch(
  candidates: Far01BackfillCandidate[],
  options: Far01BatchRunOptions,
): Promise<Far01BatchSummary> {
  const authorization =
    options.authorization ?? FAR01_DEFAULT_AUTHORIZATION;
  const phase: Far01PipelinePhase =
    options.pipelinePhase ??
    (options.mode === "DRY_RUN" ? "DRY_RUN" : "CANARY");

  assertPipelinePhaseOrder({
    phase,
    verifiedCanary: options.verifiedCanary,
  });
  if (phase === "FLEET") {
    assertFleetPhaseAllowed({
      phase,
      verifiedCanary: options.verifiedCanary,
    });
  }

  const mode = resolveExecutionMode({
    requested: options.mode,
    authorization,
    verifiedGrant: options.verifiedGrant,
  });

  const startedAt = new Date().toISOString();
  const batchId = options.batchId ?? createBatchId(new Date(startedAt));
  const sorted = sortAssetsForBatch(candidates.map((c) => c.asset)).map(
    (asset) => candidates.find((c) => c.asset.id === asset.id)!,
  );

  // Preflight pass for canary eligibility counting (pure — no mutation).
  const preflightByAssetId = new Map<
    string,
    ReturnType<typeof runFar01Preflight>
  >();
  for (const candidate of sorted) {
    const mapped = mapFar01BackfillAsset({
      asset: candidate.asset,
      beat: candidate.beat,
    });
    preflightByAssetId.set(
      candidate.asset.id,
      runFar01Preflight({
        mapped,
        sourceMeta: candidate.sourceMeta,
        destinationMeta: candidate.destinationMeta,
        destinationClaimedByOtherAssetId:
          candidate.destinationClaimedByOtherAssetId,
      }),
    );
  }

  const eligibleMigrateCount = [...preflightByAssetId.values()].filter(
    (p) => p.action === "MIGRATE",
  ).length;

  let effectiveCanaryLimit: number | null = null;
  if (mode === "LIVE") {
    assertNoImplicitUnlimited(options.canaryLimit);
    effectiveCanaryLimit = validateCanaryLimit(
      options.canaryLimit,
      eligibleMigrateCount,
    );
    if (
      options.verifiedGrant &&
      options.verifiedGrant.canaryN !== effectiveCanaryLimit
    ) {
      throw new Far01BackfillAuthorizationError(
        `LIVE denied: canaryLimit (${effectiveCanaryLimit}) !== grant.canary_n (${options.verifiedGrant.canaryN})`,
      );
    }
    if (!options.storageMutator || !options.dbMutator) {
      throw new Far01BackfillAuthorizationError(
        "LIVE mode requires explicit storageMutator and dbMutator",
      );
    }
    if (!options.storageInspector) {
      throw new Far01BackfillAuthorizationError(
        "LIVE mode requires storageInspector for mandatory re-HEAD (C-IMPL-03)",
      );
    }
  } else if (options.canaryLimit != null) {
    // Optional canary preview on DRY_RUN — still validate shape if provided.
    effectiveCanaryLimit = validateCanaryLimit(
      options.canaryLimit,
      eligibleMigrateCount,
    );
  }

  const storage =
    mode === "LIVE" && options.storageMutator
      ? options.storageMutator
      : denyStorageMutator();
  const db =
    mode === "LIVE" && options.dbMutator
      ? options.dbMutator
      : denyDbMutator();
  const inspector = options.storageInspector;

  const assetsTelemetry = [];
  let liveMutationsAttempted = 0;
  let migrateEligibleSeen = 0;

  for (const candidate of sorted) {
    if (options.shouldAbort?.()) {
      break;
    }

    const assetStarted = new Date().toISOString();
    const mapped = mapFar01BackfillAsset({
      asset: candidate.asset,
      beat: candidate.beat,
    });
    const preflight = preflightByAssetId.get(candidate.asset.id)!;

    let action = preflight.action;
    let reason = preflight.reason;
    let status = preflight.classification;
    let dbUpdateStatus:
      | "NOT_ATTEMPTED"
      | "SUCCESS"
      | "FAIL"
      | "SKIPPED"
      | "BLOCKED" = "NOT_ATTEMPTED";
    let destSize = candidate.destinationMeta.exists
      ? candidate.destinationMeta.size
      : null;
    let sizeMatch: boolean | null = null;

    if (action === "MIGRATE" && effectiveCanaryLimit != null) {
      migrateEligibleSeen += 1;
      if (migrateEligibleSeen > effectiveCanaryLimit) {
        action = "SKIP";
        reason = "beyond_canary_limit";
        status = "PASS";
      }
    }

    if (mode === "DRY_RUN") {
      dbUpdateStatus = "NOT_ATTEMPTED";
      if (action === "MIGRATE") {
        const integrity = evaluatePostCopyIntegrity({
          sourceExists: candidate.sourceMeta.exists,
          destinationExists: true,
          sourceSize: candidate.sourceMeta.size,
          destinationSize: candidate.sourceMeta.size,
          sourceChecksum: candidate.asset.checksum_sha256,
          destinationChecksum: candidate.asset.checksum_sha256,
          identityMismatch: preflight.identityMismatch,
        });
        sizeMatch = integrity.sizeMatch;
        destSize = candidate.sourceMeta.size;
        status = integrity.status;
        const gate = evaluateDbUpdateGate({
          mapped,
          preflight: { ...preflight, action: "MIGRATE" },
          postCopyAllowDbUpdate: integrity.allowDbUpdate,
          postCopyReason: integrity.reason,
        });
        dbUpdateStatus = gate.allow ? "SKIPPED" : "BLOCKED";
        reason = `dry_run:${reason}:${gate.reason}`;
      }
    } else if (action === "MIGRATE") {
      // LIVE — verified grant + mutators + mandatory re-HEAD
      liveMutationsAttempted += 1;
      try {
        if (!inspector) {
          throw new Far01BackfillAuthorizationError(
            "LIVE missing storageInspector",
          );
        }

        const preHead = await preMutationHeadCheck({
          inspector,
          bucket: mapped.asset.storage_bucket,
          sourceKey: mapped.sourceKey,
          destinationKey: mapped.destinationKey,
          expectedSourceSize: candidate.sourceMeta.size,
        });

        if (!preHead.skipCopySizeMatch) {
          await storage.copyObject({
            bucket: mapped.asset.storage_bucket,
            sourceKey: mapped.sourceKey,
            destinationKey: mapped.destinationKey,
            upsert: false,
          });
        }

        const reHead = await postCopyReHeadVerify({
          inspector,
          bucket: mapped.asset.storage_bucket,
          sourceKey: mapped.sourceKey,
          destinationKey: mapped.destinationKey,
          expectedSize: preHead.source.size,
        });

        const integrity = evaluatePostCopyIntegrity({
          sourceExists: reHead.source.exists,
          destinationExists: reHead.destination.exists,
          sourceSize: reHead.source.size,
          destinationSize: reHead.destination.size,
          sourceChecksum: candidate.asset.checksum_sha256,
          destinationChecksum: candidate.asset.checksum_sha256,
          identityMismatch: false,
        });
        sizeMatch = integrity.sizeMatch;
        destSize = reHead.destination.size;
        status = integrity.status;

        const gate = evaluateDbUpdateGate({
          mapped,
          preflight,
          postCopyAllowDbUpdate: integrity.allowDbUpdate,
          postCopyReason: integrity.reason,
        });
        if (!gate.allow) {
          dbUpdateStatus = "BLOCKED";
          reason = gate.reason;
        } else {
          const upd = await db.updateObjectKeyOptimistic({
            assetId: mapped.assetId,
            sourceKey: gate.optimisticLockSourceKey,
            destinationKey: gate.optimisticLockDestKey,
          });
          dbUpdateStatus = upd.rowsAffected === 1 ? "SUCCESS" : "FAIL";
          if (upd.rowsAffected !== 1) {
            status = "FAIL";
            reason = "optimistic_lock_failed";
          }
        }
      } catch (err) {
        status = "FAIL";
        action = "FAIL";
        reason =
          err instanceof Error ? err.message : "live_mutation_failed";
        dbUpdateStatus = "FAIL";
      }
    } else if (preflight.identityMismatch) {
      dbUpdateStatus = "BLOCKED";
    }

    const finished = new Date().toISOString();
    assetsTelemetry.push(
      buildAssetTelemetry({
        batchId,
        assetId: mapped.assetId,
        sourceKey: mapped.sourceKey,
        destinationKey: mapped.destinationKey,
        startedAt: assetStarted,
        finishedAt: finished,
        status,
        failureReason:
          action === "MIGRATE" && mode === "DRY_RUN"
            ? null
            : action === "FAIL" || action === "QUARANTINE"
              ? reason
              : action === "OWNER_REVIEW"
                ? reason
                : null,
        sourceSize: candidate.sourceMeta.size,
        destinationSize: destSize,
        checksumStatus: preflight.checksumStatus,
        dbUpdateStatus,
        retryCount: candidate.retryCount ?? 0,
        action,
        mode,
        sizeMatch,
      }),
    );
  }

  const finishedAt = new Date().toISOString();
  return summarizeBatch({
    batchId,
    mode,
    startedAt,
    finishedAt,
    authorization,
    assets: assetsTelemetry,
    liveMutationsAttempted:
      mode === "DRY_RUN" ? 0 : liveMutationsAttempted,
  });
}
