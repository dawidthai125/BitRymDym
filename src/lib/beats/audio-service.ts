import "server-only";

import type { BeatAudioAsset } from "@/types/domain";
import { AuthError, requirePermission } from "@/lib/auth/session";
import {
  BEAT_AUDIO_ASSET_SELECT,
  mapBeatAudioAssetRow,
  type BeatAudioAssetRow,
  type BeatAudioPublicInfo,
} from "@/lib/beats/audio-types";
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
