import "server-only";

import type { BeatStatus, SystemRole } from "@/types/domain";
import {
  AuthError,
  getCurrentProfile,
  requireUser,
} from "@/lib/auth/session";
import {
  BEAT_AUDIO_ASSET_SELECT,
  mapBeatAudioAssetRow,
  type BeatAudioAssetRow,
} from "@/lib/beats/audio-types";
import {
  BEAT_AUDIO_BUCKET,
  canRequestBeatAudioAccess,
  isAudioAccessPurpose,
  signedUrlTtlSeconds,
  type AudioAccessActor,
  type AudioAccessPurpose,
} from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BeatAudioAccessResult = {
  url: string;
  expiresAt: string;
  purpose: AudioAccessPurpose;
  beatId: string;
  assetId: string;
};

function actorFromRole(role: SystemRole | null): AudioAccessActor {
  if (!role) return "ANON";
  if (role === "ADMIN") return "ADMIN";
  if (role === "MODERATOR") return "MODERATOR";
  return "USER";
}

async function resolveActiveAsset(params: {
  beatId: string;
  purpose: AudioAccessPurpose;
}): Promise<BeatAudioAssetRow> {
  const admin = createSupabaseAdminClient();

  const { data: exact, error: exactError } = await admin
    .from("beat_audio_assets")
    .select(BEAT_AUDIO_ASSET_SELECT)
    .eq("beat_id", params.beatId)
    .eq("purpose", params.purpose)
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();

  if (exactError) {
    throw new Error(exactError.message);
  }
  if (exact) {
    return exact as BeatAudioAssetRow;
  }

  // Fallback to MASTER for PLAYBACK/DOWNLOAD (minimal physical model).
  const { data: master, error: masterError } = await admin
    .from("beat_audio_assets")
    .select(BEAT_AUDIO_ASSET_SELECT)
    .eq("beat_id", params.beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();

  if (masterError) {
    throw new Error(masterError.message);
  }
  if (!master) {
    throw new AuthError("NOT_FOUND", "No READY audio asset for this beat.");
  }
  return master as BeatAudioAssetRow;
}

/**
 * Single Phase 1.5 Access Gate.
 * Anonymous branch: no requireUser.
 * Authenticated branch: requireUser (and staff rules via actor).
 */
export async function requestBeatAudioAccess(params: {
  beatId: string;
  purpose: AudioAccessPurpose;
}): Promise<BeatAudioAccessResult> {
  if (!isAudioAccessPurpose(params.purpose)) {
    throw new AuthError("FORBIDDEN", "Invalid access purpose.");
  }

  const profileContext = await getCurrentProfile();
  const actor = actorFromRole(profileContext?.profile.role ?? null);

  // Authenticated path uses requireUser only when a session is expected to be
  // validated; anonymous callers proceed without requireUser.
  if (profileContext) {
    await requireUser();
  }

  const supabase = await createSupabaseServerClient();
  const { data: beat, error: beatError } = await supabase
    .from("beats")
    .select("id, status")
    .eq("id", params.beatId)
    .maybeSingle();

  // Staff may need non-published beats not visible via published RLS —
  // fall back to admin client for staff visibility check only.
  let beatStatus: BeatStatus | null = (beat?.status as BeatStatus) ?? null;
  if (!beat && (actor === "ADMIN" || actor === "MODERATOR")) {
    const admin = createSupabaseAdminClient();
    const { data: staffBeat, error: staffError } = await admin
      .from("beats")
      .select("id, status")
      .eq("id", params.beatId)
      .maybeSingle();
    if (staffError) {
      throw new Error(staffError.message);
    }
    beatStatus = (staffBeat?.status as BeatStatus) ?? null;
  } else if (beatError) {
    throw new Error(beatError.message);
  }

  if (!beatStatus) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }

  if (
    !canRequestBeatAudioAccess({
      actor,
      beatStatus,
      purpose: params.purpose,
    })
  ) {
    throw new AuthError("FORBIDDEN", "Audio access denied.");
  }

  const asset = await resolveActiveAsset({
    beatId: params.beatId,
    purpose: params.purpose,
  });

  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset/beat relation mismatch.");
  }

  const ttl = signedUrlTtlSeconds(params.purpose);
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUrl(asset.object_key, ttl);

  if (signedError || !signed?.signedUrl) {
    throw new Error(signedError?.message ?? "Failed to create signed URL.");
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  // Touch mapped asset for type safety / future logging.
  mapBeatAudioAssetRow(asset);

  return {
    url: signed.signedUrl,
    expiresAt,
    purpose: params.purpose,
    beatId: params.beatId,
    assetId: asset.id,
  };
}
