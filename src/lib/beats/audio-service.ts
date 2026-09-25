import "server-only";

import { createHash, randomUUID } from "crypto";

import type { BeatAudioAsset, BeatAudioPurpose } from "@/types/domain";
import { AuthError, requirePermission } from "@/lib/auth/session";
import {
  BEAT_AUDIO_ASSET_SELECT,
  mapBeatAudioAssetRow,
  type BeatAudioAssetRow,
  type BeatAudioPublicInfo,
} from "@/lib/beats/audio-types";
import {
  BEAT_AUDIO_BUCKET,
  buildBeatAudioObjectKey,
  validateAudioUploadMeta,
} from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function loadPlatformBeatOrThrow(beatId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select("id, ownership_type, status")
    .eq("id", beatId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  if (data.ownership_type !== "PLATFORM") {
    throw new AuthError(
      "FORBIDDEN",
      "Phase 1.5 audio is only allowed for PLATFORM beats.",
    );
  }
  return data;
}

/**
 * ADMIN creates PENDING_UPLOAD asset row and uploads bytes via service role.
 * Replaces prior active asset for the same purpose when completing READY.
 */
export async function uploadPlatformBeatAudio(params: {
  beatId: string;
  purpose?: BeatAudioPurpose;
  bytes: Uint8Array;
  contentType: string;
  originalFilename?: string | null;
}): Promise<BeatAudioAsset> {
  const context = await requirePermission("beats.edit");
  if (context.profile.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Only ADMIN may upload PLATFORM audio.");
  }
  await loadPlatformBeatOrThrow(params.beatId);

  const purpose: BeatAudioPurpose = params.purpose ?? "MASTER";
  const meta = validateAudioUploadMeta({
    contentType: params.contentType,
    byteSize: params.bytes.byteLength,
  });
  if (!meta.ok) {
    throw new Error(meta.errors.join("; "));
  }

  const assetId = randomUUID();
  const objectKey = buildBeatAudioObjectKey({
    beatId: params.beatId,
    assetId,
    purpose,
  });
  const checksum = createHash("sha256").update(params.bytes).digest("hex");
  const admin = createSupabaseAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from("beat_audio_assets")
    .insert({
      id: assetId,
      beat_id: params.beatId,
      purpose,
      status: "PENDING_UPLOAD",
      storage_bucket: BEAT_AUDIO_BUCKET,
      object_key: objectKey,
      content_type: params.contentType,
      byte_size: params.bytes.byteLength,
      checksum_sha256: checksum,
      original_filename: params.originalFilename ?? null,
      is_active: false,
      created_by: context.userId,
    })
    .select(BEAT_AUDIO_ASSET_SELECT)
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to create audio asset row.");
  }

  const { error: uploadError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .upload(objectKey, params.bytes, {
      contentType: params.contentType,
      upsert: false,
    });

  if (uploadError) {
    await admin
      .from("beat_audio_assets")
      .update({ status: "FAILED" })
      .eq("id", assetId);
    throw new Error(uploadError.message);
  }

  // Deactivate previous active for this purpose.
  const { data: previousActive } = await admin
    .from("beat_audio_assets")
    .select("id")
    .eq("beat_id", params.beatId)
    .eq("purpose", purpose)
    .eq("is_active", true)
    .maybeSingle();

  if (previousActive?.id) {
    await admin
      .from("beat_audio_assets")
      .update({
        is_active: false,
        status: "REPLACED",
        replaced_by_asset_id: assetId,
      })
      .eq("id", previousActive.id);
  }

  const { data: ready, error: readyError } = await admin
    .from("beat_audio_assets")
    .update({
      status: "READY",
      is_active: true,
      content_type: params.contentType,
      byte_size: params.bytes.byteLength,
      checksum_sha256: checksum,
    })
    .eq("id", assetId)
    .select(BEAT_AUDIO_ASSET_SELECT)
    .single();

  if (readyError || !ready) {
    throw new Error(readyError?.message ?? "Failed to activate audio asset.");
  }

  return mapBeatAudioAssetRow(ready as BeatAudioAssetRow);
}

export async function archivePlatformBeatAudio(
  assetId: string,
): Promise<BeatAudioAsset> {
  const context = await requirePermission("beats.edit");
  if (context.profile.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Only ADMIN may archive PLATFORM audio.");
  }
  const admin = createSupabaseAdminClient();

  const { data: current, error } = await admin
    .from("beat_audio_assets")
    .select(BEAT_AUDIO_ASSET_SELECT)
    .eq("id", assetId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!current) {
    throw new AuthError("NOT_FOUND", "Audio asset not found.");
  }

  await loadPlatformBeatOrThrow((current as BeatAudioAssetRow).beat_id);

  const { data, error: updateError } = await admin
    .from("beat_audio_assets")
    .update({ status: "ARCHIVED", is_active: false })
    .eq("id", assetId)
    .select(BEAT_AUDIO_ASSET_SELECT)
    .single();

  if (updateError || !data) {
    throw new Error(updateError?.message ?? "Failed to archive audio asset.");
  }

  return mapBeatAudioAssetRow(data as BeatAudioAssetRow);
}

export async function getBeatAudioPublicInfo(
  beatId: string,
): Promise<BeatAudioPublicInfo> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_audio_assets")
    .select("id, purpose, status, is_active")
    .eq("beat_id", beatId)
    .eq("is_active", true)
    .eq("status", "READY");

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  return {
    beatId,
    hasAudio: rows.length > 0,
    activeMasterReady: rows.some((r) => r.purpose === "MASTER"),
  };
}
