/**
 * FAR-01 read-only inventory refresh (IA-3 / B-PDR-06).
 *
 * Uses injected Far01DbReader + Far01StorageInspector + aux queries.
 * Historical 68/2/3/30 is BASELINE ONLY — never live truth.
 */

import { buildUserBeatAudioObjectKey } from "@/lib/beats/audio-validation";

import {
  loadFar01BackfillCandidates,
  type Far01DbReader,
  type Far01InventorySnapshot,
  type Far01LoadResult,
} from "./loader";
import { mapFar01BackfillAsset } from "./mapping";
import type { Far01StorageInspector } from "./mutators";
import { runFar01Preflight } from "./preflight";
import {
  FAR01_BACKFILL_PURPOSE,
  type Far01Action,
  type Far01ChecksumStatus,
  type Far01IntegrityClass,
} from "./types";

/** Historical Phase 0 / closeout baseline — NOT current production evidence. */
export const FAR01_HISTORICAL_INVENTORY_BASELINE = {
  label: "historical_phase0_closeout",
  evidence_class: "HISTORICAL" as const,
  legacy_user: 68,
  canonical_user: 2,
  platform: 3,
  orphan_storage: 30,
};

export type Far01InventoryAssetRow = {
  asset_id: string;
  owner_id: string | null;
  beat_id: string;
  current_object_key: string;
  expected_canonical_key: string;
  asset_status: string;
  beat_status: string;
  ownership: string;
  source_existence: boolean;
  source_size: number | null;
  destination_existence: boolean;
  destination_size: number | null;
  checksum_status: Far01ChecksumStatus;
  identity_anomaly: boolean;
  classification: Far01IntegrityClass | "PASS";
  action: Far01Action;
  destination_claimed_by_other_asset_id: string | null;
};

export type Far01HistoricalDelta = {
  baseline: typeof FAR01_HISTORICAL_INVENTORY_BASELINE;
  live: {
    legacy_user: number;
    canonical_user: number;
    platform: number;
    orphan_storage: number;
  };
  delta: {
    legacy_user: number;
    canonical_user: number;
    platform: number;
    orphan_storage: number;
  };
  note: string;
};

export type Far01InventoryRefreshResult = {
  loaded_at: string;
  inventory: Far01InventorySnapshot;
  assets: Far01InventoryAssetRow[];
  historical_delta: Far01HistoricalDelta;
  load: Far01LoadResult;
};

export type Far01InventoryRefreshPorts = {
  db: Far01DbReader;
  storage: Far01StorageInspector;
  /** SELECT-only platform count — must not hard-code historical 3. */
  countPlatformMasterAssets: () => Promise<number>;
  /**
   * Read-only orphan Storage keys (objects without DB row).
   * Must not hard-code historical 30.
   */
  listOrphanStorageKeys: () => Promise<string[]>;
};

/**
 * Refresh production inventory read-only.
 * Fail closed if ports throw (partial read = not a complete snapshot).
 */
export async function refreshFar01Inventory(
  ports: Far01InventoryRefreshPorts,
): Promise<Far01InventoryRefreshResult> {
  const platformCount = await ports.countPlatformMasterAssets();
  const orphanKeys = await ports.listOrphanStorageKeys();

  const load = await loadFar01BackfillCandidates({
    db: ports.db,
    storage: ports.storage,
    platformAssetCount: platformCount,
    orphanStorageKeys: orphanKeys,
  });

  const assets: Far01InventoryAssetRow[] = [];
  for (const candidate of load.candidates) {
    const mapped = mapFar01BackfillAsset({
      asset: candidate.asset,
      beat: candidate.beat,
    });
    const expectedCanonical = buildUserBeatAudioObjectKey({
      ownerId: mapped.ownerId,
      beatId: mapped.beatId,
      assetId: mapped.assetId,
      purpose: FAR01_BACKFILL_PURPOSE,
    });
    const preflight = runFar01Preflight({
      mapped,
      sourceMeta: candidate.sourceMeta,
      destinationMeta: candidate.destinationMeta,
      destinationClaimedByOtherAssetId:
        candidate.destinationClaimedByOtherAssetId,
    });

    assets.push({
      asset_id: mapped.assetId,
      owner_id: mapped.beat.owner_id,
      beat_id: mapped.beatId,
      current_object_key: mapped.sourceKey,
      expected_canonical_key: expectedCanonical,
      asset_status: mapped.asset.status,
      beat_status: mapped.beat.status,
      ownership: mapped.beat.ownership_type,
      source_existence: candidate.sourceMeta.exists,
      source_size: candidate.sourceMeta.size,
      destination_existence: candidate.destinationMeta.exists,
      destination_size: candidate.destinationMeta.size,
      checksum_status: preflight.checksumStatus,
      identity_anomaly: preflight.identityMismatch,
      classification: preflight.classification,
      action: preflight.action,
      destination_claimed_by_other_asset_id:
        candidate.destinationClaimedByOtherAssetId,
    });
  }

  const live = {
    legacy_user: load.inventory.legacy_shape,
    canonical_user: load.inventory.canonical_shape,
    platform: load.inventory.platform_excluded,
    orphan_storage: load.inventory.orphan_storage_excluded,
  };

  const historical_delta: Far01HistoricalDelta = {
    baseline: FAR01_HISTORICAL_INVENTORY_BASELINE,
    live,
    delta: {
      legacy_user: live.legacy_user - FAR01_HISTORICAL_INVENTORY_BASELINE.legacy_user,
      canonical_user:
        live.canonical_user - FAR01_HISTORICAL_INVENTORY_BASELINE.canonical_user,
      platform: live.platform - FAR01_HISTORICAL_INVENTORY_BASELINE.platform,
      orphan_storage:
        live.orphan_storage - FAR01_HISTORICAL_INVENTORY_BASELINE.orphan_storage,
    },
    note: "Baseline is HISTORICAL (Phase 0 / closeout). Live counts come from read-only refresh only.",
  };

  return {
    loaded_at: load.inventory.loaded_at,
    inventory: load.inventory,
    assets,
    historical_delta,
    load,
  };
}
