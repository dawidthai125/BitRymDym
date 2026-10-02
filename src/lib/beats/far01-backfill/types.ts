/**
 * FAR-01 Backfill — types & constants.
 *
 * Implementation GO: YES (tooling only).
 * Backfill GO: NO — LIVE execution requires separate Owner authorization.
 * Retirement GO: NO.
 */

export const FAR01_BACKFILL_BUCKET = "beat-audio" as const;
export const FAR01_BACKFILL_PURPOSE = "MASTER" as const;

/** Default eligible asset statuses (C-02 binding). */
export const FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES = ["READY"] as const;

export type Far01IntegrityClass = "PASS" | "FAIL" | "UNKNOWN" | "ANOMALY";
export type Far01Action =
  | "MIGRATE"
  | "SKIP"
  | "QUARANTINE"
  | "FAIL"
  | "OWNER_REVIEW";

export type Far01ChecksumStatus = "PASS" | "FAIL" | "UNKNOWN";
export type Far01DbUpdateStatus =
  | "NOT_ATTEMPTED"
  | "SUCCESS"
  | "FAIL"
  | "SKIPPED"
  | "BLOCKED";

export type Far01ExecutionMode = "DRY_RUN" | "LIVE";

/**
 * LIVE requires OD-BF-08 Backfill GO.
 * Defaults are all false — DEFAULT = NO EXECUTION.
 */
export type Far01BackfillAuthorization = {
  /** OD-BF-08 — separate Owner Backfill GO */
  backfillGo: boolean;
  /** OD-BF-06 — explicit operator approval for this run */
  operatorApproval: boolean;
  /** Optional operator id (Owner-defined; not invented) */
  operatorId?: string | null;
};

export const FAR01_DEFAULT_AUTHORIZATION: Far01BackfillAuthorization = {
  backfillGo: false,
  operatorApproval: false,
  operatorId: null,
};

export type Far01AssetSnapshot = {
  id: string;
  beat_id: string;
  purpose: string;
  status: string;
  storage_bucket: string;
  object_key: string;
  content_type: string | null;
  byte_size: number | null;
  checksum_sha256: string | null;
  is_active: boolean;
  replaced_by_asset_id: string | null;
};

export type Far01BeatSnapshot = {
  id: string;
  owner_id: string | null;
  ownership_type: string;
  status: string;
};

export type Far01StorageObjectMeta = {
  exists: boolean;
  size: number | null;
  contentType: string | null;
};

export type Far01MappedAsset = {
  asset: Far01AssetSnapshot;
  beat: Far01BeatSnapshot;
  ownerId: string;
  beatId: string;
  assetId: string;
  sourceKey: string;
  destinationKey: string;
  expectedLegacyTwin: string;
  pathOwnerId: string | null;
  pathBeatId: string | null;
  pathAssetId: string | null;
  identityMismatch: boolean;
  alreadyCanonical: boolean;
  isLegacyShape: boolean;
};

export type Far01PreflightResult = {
  classification: Far01IntegrityClass | "PASS";
  action: Far01Action;
  reason: string;
  identityMismatch: boolean;
  checksumStatus: Far01ChecksumStatus;
};

export type Far01AssetTelemetry = {
  batch_id: string;
  asset_id: string;
  source_key: string;
  destination_key: string;
  started_at: string;
  finished_at: string;
  status: Far01IntegrityClass | "PASS";
  failure_reason: string | null;
  source_size: number | null;
  destination_size: number | null;
  checksum_status: Far01ChecksumStatus;
  DB_update_status: Far01DbUpdateStatus;
  retry_count: number;
  action: Far01Action;
  mode: Far01ExecutionMode;
  size_match: boolean | null;
  /** Explicit: size equality is never cryptographic identity (C-03). */
  content_identity: "UNKNOWN" | "CHECKSUM_PASS" | "CHECKSUM_FAIL" | "N/A";
};

export type Far01BatchSummary = {
  batch_id: string;
  mode: Far01ExecutionMode;
  started_at: string;
  finished_at: string;
  total: number;
  migrate: number;
  skip: number;
  quarantine: number;
  fail: number;
  owner_review: number;
  live_mutations_attempted: number;
  authorization: Far01BackfillAuthorization;
  assets: Far01AssetTelemetry[];
};

export type Far01RollbackPlan = {
  asset_id: string;
  canRevert: boolean;
  reason: string;
  legacy_object_key: string;
  current_object_key: string;
  source_must_exist: true;
};
