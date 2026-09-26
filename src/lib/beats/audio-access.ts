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
import { ensureAnonymousDownloadIdentity } from "@/lib/downloads/anonymous-identity";
import {
  finalizeDownload,
  insertAdminDownloadEvent,
  releaseDownloadReservation,
  reserveDownloadSlot,
  throwLimitReached,
} from "@/lib/downloads/slots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BeatAudioAccessResult = {
  url: string;
  expiresAt: string;
  purpose: AudioAccessPurpose;
  beatId: string;
  assetId: string;
  remainingToday?: number;
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
 * Single Phase 1.5 Access Gate (REUSE) + Phase 1.8A DOWNLOAD limits/events.
 *
 * DOWNLOAD OD-17 order:
 * AuthZ → reserve slot → signed URL SUCCESS → finalize DOWNLOAD_EVENT
 * Reservation is never a DOWNLOAD_EVENT.
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

  if (profileContext) {
    await requireUser();
  }

  const supabase = await createSupabaseServerClient();
  const { data: beat, error: beatError } = await supabase
    .from("beats")
    .select("id, status")
    .eq("id", params.beatId)
    .maybeSingle();

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

  let reservationId: string | null = null;
  let remainingToday: number | undefined;

  if (params.purpose === "DOWNLOAD") {
    if (actor === "ADMIN") {
      // Limit-exempt; final event after signed URL only.
    } else if (actor === "ANON") {
      const { tokenHash } = await ensureAnonymousDownloadIdentity();
      const reserve = await reserveDownloadSlot({
        beatId: params.beatId,
        assetId: asset.id,
        actorType: "ANON",
        userId: null,
        anonymousTokenHash: tokenHash,
      });
      if (!reserve.allowed) {
        throwLimitReached();
      }
      reservationId = reserve.reservationId;
      remainingToday = reserve.remaining;
    } else if (actor === "USER") {
      const userId = profileContext!.profile.id;
      const reserve = await reserveDownloadSlot({
        beatId: params.beatId,
        assetId: asset.id,
        actorType: "USER",
        userId,
        anonymousTokenHash: null,
      });
      if (!reserve.allowed) {
        throwLimitReached();
      }
      reservationId = reserve.reservationId;
      remainingToday = reserve.remaining;
    }
  }

  const ttl = signedUrlTtlSeconds(params.purpose);
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUrl(asset.object_key, ttl);

  if (signedError || !signed?.signedUrl) {
    if (reservationId) {
      await releaseDownloadReservation(reservationId);
    }
    throw new Error(signedError?.message ?? "Failed to create signed URL.");
  }

  if (params.purpose === "DOWNLOAD") {
    if (reservationId) {
      try {
        // OD-17: final DOWNLOAD_EVENT only after signed URL success.
        await finalizeDownload({
          reservationId,
          beatId: params.beatId,
          assetId: asset.id,
        });
      } catch (finalizeError) {
        // No DOWNLOAD_EVENT. Release hold so the slot is not stuck until TTL.
        await releaseDownloadReservation(reservationId);
        throw finalizeError instanceof Error
          ? finalizeError
          : new Error("Download finalize failed.");
      }
    } else if (actor === "ADMIN" && profileContext) {
      await insertAdminDownloadEvent({
        beatId: params.beatId,
        assetId: asset.id,
        userId: profileContext.profile.id,
      });
    }
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  mapBeatAudioAssetRow(asset);

  return {
    url: signed.signedUrl,
    expiresAt,
    purpose: params.purpose,
    beatId: params.beatId,
    assetId: asset.id,
    remainingToday,
  };
}
