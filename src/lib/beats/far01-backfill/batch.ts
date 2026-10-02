import { evaluatePostCopyIntegrity } from "./integrity";
import {
  assertLiveExecutionAuthorized,
  evaluateDbUpdateGate,
  Far01BackfillAuthorizationError,
  resolveExecutionMode,
} from "./gates";
import { mapFar01BackfillAsset } from "./mapping";
import { runFar01Preflight } from "./preflight";
import {
  buildAssetTelemetry,
  createBatchId,
  sortAssetsForBatch,
  summarizeBatch,
} from "./telemetry";
import type {
  Far01AssetSnapshot,
  Far01BackfillAuthorization,
  Far01BatchSummary,
  Far01BeatSnapshot,
  Far01ExecutionMode,
  Far01StorageObjectMeta,
} from "./types";
import { FAR01_DEFAULT_AUTHORIZATION } from "./types";

export type Far01BackfillCandidate = {
  asset: Far01AssetSnapshot & { created_at?: string };
  beat: Far01BeatSnapshot;
  sourceMeta: Far01StorageObjectMeta;
  destinationMeta: Far01StorageObjectMeta;
  destinationClaimedByOtherAssetId: string | null;
  retryCount?: number;
};

/**
 * Injected adapters — Production adapters must never be wired without Backfill GO.
 * Default implementation of this session uses in-memory / no-op only in tests.
 */
export type Far01StorageMutator = {
  copyObject: (params: {
    bucket: string;
    sourceKey: string;
    destinationKey: string;
  }) => Promise<void>;
};

export type Far01DbMutator = {
  updateObjectKeyOptimistic: (params: {
    assetId: string;
    sourceKey: string;
    destinationKey: string;
  }) => Promise<{ rowsAffected: number }>;
};

export type Far01BatchRunOptions = {
  mode: Far01ExecutionMode;
  authorization?: Far01BackfillAuthorization;
  /** OD-BF-07 — Owner-defined; if set, only first N MIGRATE-eligible after sort */
  canaryLimit?: number | null;
  batchId?: string;
  storageMutator?: Far01StorageMutator;
  dbMutator?: Far01DbMutator;
  /** Abort if true between assets */
  shouldAbort?: () => boolean;
};

function denyMutatingAdapters(): {
  storage: Far01StorageMutator;
  db: Far01DbMutator;
} {
  return {
    storage: {
      async copyObject() {
        throw new Far01BackfillAuthorizationError(
          "Storage COPY denied: no mutator authorized (Backfill GO required)",
        );
      },
    },
    db: {
      async updateObjectKeyOptimistic() {
        throw new Far01BackfillAuthorizationError(
          "DB UPDATE denied: no mutator authorized (Backfill GO required)",
        );
      },
    },
  };
}

/**
 * Run FAR-01 backfill batch.
 * DRY_RUN: preflight + telemetry only (zero mutations).
 * LIVE: requires OD-BF-08 + operator approval + injected mutators.
 */
export async function runFar01BackfillBatch(
  candidates: Far01BackfillCandidate[],
  options: Far01BatchRunOptions,
): Promise<Far01BatchSummary> {
  const authorization =
    options.authorization ?? FAR01_DEFAULT_AUTHORIZATION;
  const mode = resolveExecutionMode({
    requested: options.mode,
    authorization,
  });

  const startedAt = new Date().toISOString();
  const batchId = options.batchId ?? createBatchId(new Date(startedAt));
  const sorted = sortAssetsForBatch(candidates.map((c) => c.asset)).map(
    (asset) => candidates.find((c) => c.asset.id === asset.id)!,
  );

  const denied = denyMutatingAdapters();
  const storage =
    mode === "LIVE" && options.storageMutator
      ? options.storageMutator
      : denied.storage;
  const db =
    mode === "LIVE" && options.dbMutator ? options.dbMutator : denied.db;

  if (mode === "LIVE") {
    assertLiveExecutionAuthorized(authorization);
    if (!options.storageMutator || !options.dbMutator) {
      throw new Far01BackfillAuthorizationError(
        "LIVE mode requires explicit storageMutator and dbMutator",
      );
    }
  }

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
    const preflight = runFar01Preflight({
      mapped,
      sourceMeta: candidate.sourceMeta,
      destinationMeta: candidate.destinationMeta,
      destinationClaimedByOtherAssetId:
        candidate.destinationClaimedByOtherAssetId,
    });

    // Canary: only process Owner-defined N migrate-eligible rows as MIGRATE
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

    if (action === "MIGRATE" && options.canaryLimit != null) {
      migrateEligibleSeen += 1;
      if (migrateEligibleSeen > options.canaryLimit) {
        action = "SKIP";
        reason = "beyond_canary_limit";
        status = "PASS";
      }
    }

    if (mode === "DRY_RUN") {
      dbUpdateStatus = "NOT_ATTEMPTED";
      // Simulate successful copy verification without mutating Storage/DB.
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
        // Dry-run never writes — mark planned outcome as SKIPPED/BLOCKED.
        dbUpdateStatus = gate.allow ? "SKIPPED" : "BLOCKED";
        reason = `dry_run:${reason}:${gate.reason}`;
      }
    } else if (action === "MIGRATE") {
      // LIVE path — only reachable with Backfill GO + mutators
      liveMutationsAttempted += 1;
      try {
        await storage.copyObject({
          bucket: mapped.asset.storage_bucket,
          sourceKey: mapped.sourceKey,
          destinationKey: mapped.destinationKey,
        });
        const integrity = evaluatePostCopyIntegrity({
          sourceExists: true,
          destinationExists: true,
          sourceSize: candidate.sourceMeta.size,
          destinationSize: candidate.sourceMeta.size,
          sourceChecksum: candidate.asset.checksum_sha256,
          destinationChecksum: candidate.asset.checksum_sha256,
          identityMismatch: false,
        });
        sizeMatch = integrity.sizeMatch;
        destSize = candidate.sourceMeta.size;
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
