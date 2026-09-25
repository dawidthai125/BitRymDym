import type {
  BeatAudioAsset,
  BeatAudioAssetStatus,
  BeatAudioPurpose,
} from "@/types/domain";

export type BeatAudioAssetRow = {
  id: string;
  beat_id: string;
  purpose: BeatAudioPurpose;
  status: BeatAudioAssetStatus;
  storage_bucket: string;
  object_key: string;
  content_type: string | null;
  byte_size: number | null;
  checksum_sha256: string | null;
  original_filename: string | null;
  is_active: boolean;
  replaced_by_asset_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function mapBeatAudioAssetRow(row: BeatAudioAssetRow): BeatAudioAsset {
  return {
    id: row.id,
    beatId: row.beat_id,
    purpose: row.purpose,
    status: row.status,
    storageBucket: row.storage_bucket,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
    checksumSha256: row.checksum_sha256,
    originalFilename: row.original_filename,
    isActive: row.is_active,
    replacedByAssetId: row.replaced_by_asset_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const BEAT_AUDIO_ASSET_SELECT =
  "id, beat_id, purpose, status, storage_bucket, object_key, content_type, byte_size, checksum_sha256, original_filename, is_active, replaced_by_asset_id, created_by, created_at, updated_at";

/** Public-safe projection — never return object_key to browsers. */
export type BeatAudioPublicInfo = {
  beatId: string;
  hasAudio: boolean;
  activeMasterReady: boolean;
};
