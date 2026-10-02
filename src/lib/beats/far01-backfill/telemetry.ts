import { contentIdentityFromChecksum } from "./integrity";
import type {
  Far01Action,
  Far01AssetTelemetry,
  Far01BatchSummary,
  Far01ChecksumStatus,
  Far01DbUpdateStatus,
  Far01ExecutionMode,
  Far01IntegrityClass,
  Far01BackfillAuthorization,
} from "./types";

export function createBatchId(now: Date = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  return `far01-bf-${iso}`;
}

export function buildAssetTelemetry(params: {
  batchId: string;
  assetId: string;
  sourceKey: string;
  destinationKey: string;
  startedAt: string;
  finishedAt: string;
  status: Far01IntegrityClass | "PASS";
  failureReason: string | null;
  sourceSize: number | null;
  destinationSize: number | null;
  checksumStatus: Far01ChecksumStatus;
  dbUpdateStatus: Far01DbUpdateStatus;
  retryCount: number;
  action: Far01Action;
  mode: Far01ExecutionMode;
  sizeMatch: boolean | null;
}): Far01AssetTelemetry {
  return {
    batch_id: params.batchId,
    asset_id: params.assetId,
    source_key: params.sourceKey,
    destination_key: params.destinationKey,
    started_at: params.startedAt,
    finished_at: params.finishedAt,
    status: params.status,
    failure_reason: params.failureReason,
    source_size: params.sourceSize,
    destination_size: params.destinationSize,
    checksum_status: params.checksumStatus,
    DB_update_status: params.dbUpdateStatus,
    retry_count: params.retryCount,
    action: params.action,
    mode: params.mode,
    size_match: params.sizeMatch,
    content_identity: contentIdentityFromChecksum(params.checksumStatus),
  };
}

export function summarizeBatch(params: {
  batchId: string;
  mode: Far01ExecutionMode;
  startedAt: string;
  finishedAt: string;
  authorization: Far01BackfillAuthorization;
  assets: Far01AssetTelemetry[];
  liveMutationsAttempted: number;
}): Far01BatchSummary {
  const counts = {
    migrate: 0,
    skip: 0,
    quarantine: 0,
    fail: 0,
    owner_review: 0,
  };
  for (const a of params.assets) {
    if (a.action === "MIGRATE") counts.migrate += 1;
    else if (a.action === "SKIP") counts.skip += 1;
    else if (a.action === "QUARANTINE") counts.quarantine += 1;
    else if (a.action === "FAIL") counts.fail += 1;
    else if (a.action === "OWNER_REVIEW") counts.owner_review += 1;
  }
  return {
    batch_id: params.batchId,
    mode: params.mode,
    started_at: params.startedAt,
    finished_at: params.finishedAt,
    total: params.assets.length,
    ...counts,
    live_mutations_attempted: params.liveMutationsAttempted,
    authorization: params.authorization,
    assets: params.assets,
  };
}

/** Deterministic ordering for resume/idempotency. */
export function sortAssetsForBatch<T extends { id: string; created_at?: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
