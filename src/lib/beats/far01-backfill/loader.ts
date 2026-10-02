/**
 * FAR-01 Backfill — read-only DB/Storage candidate loader (C-IMPL-04).
 *
 * DB-authoritative. Never mutates Storage or DB.
 * Free-form client/operator object_key paths are rejected.
 * Platform assets and orphans (no DB row) stay outside the USER migrate set.
 *
 * Adapters are injected — no Production credentials in this module.
 * OD-DRYRUN-01 permits capability; this loader does not execute a prod dry-run.
 */

import { assertNoClientObjectKeyAuthority, mapFar01BackfillAsset } from "./mapping";
import type { Far01StorageInspector } from "./mutators";
import { sortAssetsForBatch } from "./telemetry";
import type {
  Far01AssetSnapshot,
  Far01BeatSnapshot,
  Far01StorageObjectMeta,
} from "./types";
import { FAR01_BACKFILL_BUCKET, FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES } from "./types";
import type { Far01BackfillCandidate } from "./types";

export type Far01DbAssetRow = {
  asset: Far01AssetSnapshot & { created_at?: string };
  beat: Far01BeatSnapshot;
};

export type Far01DbReader = {
  /** USER MASTER rows from DB (authoritative). Must not include platform-only invent. */
  listUserMasterAssets: () => Promise<Far01DbAssetRow[]>;
  /** Detect destination claimed by another asset id. */
  findAssetIdByObjectKey: (objectKey: string) => Promise<string | null>;
};

export type Far01InventorySnapshot = {
  loaded_at: string;
  user_master_rows: number;
  legacy_shape: number;
  canonical_shape: number;
  platform_excluded: number;
  orphan_storage_excluded: number;
  destination_conflicts: number;
  candidate_count: number;
};

export type Far01LoadResult = {
  candidates: Far01BackfillCandidate[];
  inventory: Far01InventorySnapshot;
};

function isUserOwnership(beat: Far01BeatSnapshot): boolean {
  return beat.ownership_type === "USER";
}

/**
 * Load deterministic USER migrate candidates from DB + read-only Storage HEAD.
 * Does not COPY/UPDATE/DELETE. Does not trust client object_key.
 */
export async function loadFar01BackfillCandidates(params: {
  db: Far01DbReader;
  storage: Far01StorageInspector;
  /** Rejected if present — PATH ≠ AUTHORITY. */
  clientObjectKey?: string | null;
  /** Optional Storage orphan keys (no DB) — counted excluded, never migrated. */
  orphanStorageKeys?: string[];
  /** Optional platform asset count for inventory (excluded). */
  platformAssetCount?: number;
}): Promise<Far01LoadResult> {
  assertNoClientObjectKeyAuthority({
    clientObjectKey: params.clientObjectKey,
  });

  const rows = await params.db.listUserMasterAssets();
  const userRows = rows.filter(
    (r) =>
      isUserOwnership(r.beat) &&
      r.asset.purpose === "MASTER" &&
      r.asset.storage_bucket === FAR01_BACKFILL_BUCKET &&
      (FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES as readonly string[]).includes(
        r.asset.status,
      ),
  );

  const sortedAssets = sortAssetsForBatch(
    userRows.map((r) => r.asset),
  );
  const byId = new Map(userRows.map((r) => [r.asset.id, r]));

  let legacyShape = 0;
  let canonicalShape = 0;
  let destinationConflicts = 0;
  const candidates: Far01BackfillCandidate[] = [];

  for (const asset of sortedAssets) {
    const row = byId.get(asset.id)!;
    const mapped = mapFar01BackfillAsset({
      asset: row.asset,
      beat: row.beat,
    });
    if (mapped.isLegacyShape) legacyShape += 1;
    if (mapped.alreadyCanonical) canonicalShape += 1;

    const sourceMeta: Far01StorageObjectMeta = await params.storage.headObject({
      bucket: FAR01_BACKFILL_BUCKET,
      key: mapped.sourceKey,
    });
    const destinationMeta: Far01StorageObjectMeta =
      await params.storage.headObject({
        bucket: FAR01_BACKFILL_BUCKET,
        key: mapped.destinationKey,
      });

    let destinationClaimedByOtherAssetId: string | null = null;
    if (!mapped.alreadyCanonical) {
      const claimant = await params.db.findAssetIdByObjectKey(
        mapped.destinationKey,
      );
      if (claimant && claimant !== mapped.assetId) {
        destinationClaimedByOtherAssetId = claimant;
        destinationConflicts += 1;
      }
    }

    candidates.push({
      asset: row.asset,
      beat: row.beat,
      sourceMeta,
      destinationMeta,
      destinationClaimedByOtherAssetId,
      retryCount: 0,
    });
  }

  const inventory: Far01InventorySnapshot = {
    loaded_at: new Date().toISOString(),
    user_master_rows: userRows.length,
    legacy_shape: legacyShape,
    canonical_shape: canonicalShape,
    platform_excluded: params.platformAssetCount ?? 0,
    orphan_storage_excluded: params.orphanStorageKeys?.length ?? 0,
    destination_conflicts: destinationConflicts,
    candidate_count: candidates.length,
  };

  return { candidates, inventory };
}
