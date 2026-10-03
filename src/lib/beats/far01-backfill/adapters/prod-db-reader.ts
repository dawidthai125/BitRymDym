/**
 * FAR-01 production DB read adapter (IA-1 / B-PDR-01).
 *
 * Implements Far01DbReader with SELECT-only surface.
 * Injected into loader — does not mutate loader.ts.
 *
 * Does NOT import createSupabaseAdminClient / Far01DbMutator / write helpers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Far01DbAssetRow, Far01DbReader } from "../loader";
import {
  FAR01_BACKFILL_BUCKET,
  FAR01_BACKFILL_PURPOSE,
  FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES,
  type Far01AssetSnapshot,
  type Far01BeatSnapshot,
} from "../types";
import { createFar01DryRunReadonlyClient } from "../readonly-client";

const ASSET_SELECT =
  "id, beat_id, purpose, status, storage_bucket, object_key, content_type, byte_size, checksum_sha256, is_active, replaced_by_asset_id, created_at";

type AssetJoinRow = {
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
  created_at: string;
  beats:
    | {
        id: string;
        owner_id: string | null;
        ownership_type: string;
        status: string;
      }
    | {
        id: string;
        owner_id: string | null;
        ownership_type: string;
        status: string;
      }[]
    | null;
};

function mapBeat(
  beat:
    | {
        id: string;
        owner_id: string | null;
        ownership_type: string;
        status: string;
      }
    | null
    | undefined,
): Far01BeatSnapshot | null {
  if (!beat) return null;
  return {
    id: beat.id,
    owner_id: beat.owner_id,
    ownership_type: beat.ownership_type,
    status: beat.status,
  };
}

function mapAsset(row: AssetJoinRow): Far01AssetSnapshot & { created_at?: string } {
  return {
    id: row.id,
    beat_id: row.beat_id,
    purpose: row.purpose,
    status: row.status,
    storage_bucket: row.storage_bucket,
    object_key: row.object_key,
    content_type: row.content_type,
    byte_size: row.byte_size,
    checksum_sha256: row.checksum_sha256,
    is_active: row.is_active,
    replaced_by_asset_id: row.replaced_by_asset_id,
    created_at: row.created_at,
  };
}

function unwrapBeat(
  beats: AssetJoinRow["beats"],
): {
  id: string;
  owner_id: string | null;
  ownership_type: string;
  status: string;
} | null {
  if (!beats) return null;
  return Array.isArray(beats) ? (beats[0] ?? null) : beats;
}

/**
 * Narrow SELECT-only adapter. Returned object has exactly two methods.
 */
export function createFar01ProdDbReader(
  client: Pick<SupabaseClient, "from">,
): Far01DbReader {
  const reader: Far01DbReader = {
    async listUserMasterAssets(): Promise<Far01DbAssetRow[]> {
      const eligible = [...FAR01_DEFAULT_ELIGIBLE_ASSET_STATUSES];
      const { data, error } = await client
        .from("beat_audio_assets")
        .select(
          `${ASSET_SELECT}, beats!inner(id, owner_id, ownership_type, status)`,
        )
        .eq("purpose", FAR01_BACKFILL_PURPOSE)
        .eq("storage_bucket", FAR01_BACKFILL_BUCKET)
        .in("status", eligible)
        .eq("beats.ownership_type", "USER");

      if (error) {
        throw new Error(`Far01ProdDbReader.listUserMasterAssets: ${error.message}`);
      }

      const rows: Far01DbAssetRow[] = [];
      for (const raw of data ?? []) {
        const row = raw as AssetJoinRow;
        const beat = mapBeat(unwrapBeat(row.beats));
        if (!beat) continue;
        rows.push({ asset: mapAsset(row), beat });
      }
      return rows;
    },

    async findAssetIdByObjectKey(objectKey: string): Promise<string | null> {
      if (!objectKey || typeof objectKey !== "string") {
        return null;
      }
      const { data, error } = await client
        .from("beat_audio_assets")
        .select("id")
        .eq("storage_bucket", FAR01_BACKFILL_BUCKET)
        .eq("object_key", objectKey)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Far01ProdDbReader.findAssetIdByObjectKey: ${error.message}`,
        );
      }
      return data?.id ?? null;
    },
  };

  return Object.freeze(reader);
}

/** Factory using R1 env credentials (fail closed). */
export function createFar01ProdDbReaderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Far01DbReader {
  return createFar01ProdDbReader(createFar01DryRunReadonlyClient(env));
}

/** Aux SELECT helpers for inventory (platform / DB keys) — still read-only. */
export type Far01ProdInventoryDbAux = {
  countPlatformMasterAssets: () => Promise<number>;
  listBeatAudioObjectKeys: () => Promise<string[]>;
};

export function createFar01ProdInventoryDbAux(
  client: Pick<SupabaseClient, "from">,
): Far01ProdInventoryDbAux {
  return Object.freeze({
    async countPlatformMasterAssets(): Promise<number> {
      const { count, error } = await client
        .from("beat_audio_assets")
        .select("id, beats!inner(ownership_type)", { count: "exact", head: true })
        .eq("purpose", FAR01_BACKFILL_PURPOSE)
        .eq("storage_bucket", FAR01_BACKFILL_BUCKET)
        .eq("beats.ownership_type", "PLATFORM");

      if (error) {
        throw new Error(
          `Far01ProdInventoryDbAux.countPlatformMasterAssets: ${error.message}`,
        );
      }
      return count ?? 0;
    },

    async listBeatAudioObjectKeys(): Promise<string[]> {
      const { data, error } = await client
        .from("beat_audio_assets")
        .select("object_key")
        .eq("storage_bucket", FAR01_BACKFILL_BUCKET);

      if (error) {
        throw new Error(
          `Far01ProdInventoryDbAux.listBeatAudioObjectKeys: ${error.message}`,
        );
      }
      return (data ?? [])
        .map((r) => (r as { object_key: string }).object_key)
        .filter((k) => typeof k === "string" && k.length > 0);
    },
  });
}
