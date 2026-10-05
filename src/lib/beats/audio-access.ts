import "server-only";

import type { BeatOwnershipType, BeatStatus, SystemRole } from "@/types/domain";
import {
  AuthError,
  getCurrentProfile,
  requireRole,
  requireUser,
} from "@/lib/auth/session";
import {
  BEAT_AUDIO_ASSET_SELECT,
  mapBeatAudioAssetRow,
  type BeatAudioAssetRow,
} from "@/lib/beats/audio-types";
import {
  BEAT_AUDIO_BUCKET,
  BEAT_AUDIO_DOWNLOAD_TTL_SECONDS,
  canRequestBeatAudioAccess,
  isAudioAccessPurpose,
  signedUrlTtlSeconds,
  type AudioAccessActor,
  type AudioAccessPurpose,
} from "@/lib/beats/audio-validation";
import { ensureAnonymousDownloadIdentity } from "@/lib/downloads/anonymous-identity";
import { dailyDownloadLimitForActor } from "@/lib/downloads/limits";
import {
  finalizeDownload,
  insertAdminDownloadEvent,
  releaseDownloadReservation,
  reserveDownloadSlot,
  throwLimitReached,
} from "@/lib/downloads/slots";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
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

export type PlatformBeatOpsExportResult = {
  url: string;
  expiresAt: string;
  beatId: string;
  assetId: string;
  ownershipType: "PLATFORM";
  purpose: "OPS_EXPORT";
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

type BeatAccessRow = {
  status: BeatStatus;
  ownershipType: BeatOwnershipType;
};

async function loadBeatForAccess(params: {
  beatId: string;
  actor: AudioAccessActor;
}): Promise<BeatAccessRow> {
  const supabase = await createSupabaseServerClient();
  const { data: beat, error: beatError } = await supabase
    .from("beats")
    .select("id, status, ownership_type")
    .eq("id", params.beatId)
    .maybeSingle();

  if (beat) {
    return {
      status: beat.status as BeatStatus,
      ownershipType: beat.ownership_type as BeatOwnershipType,
    };
  }

  if (params.actor === "ADMIN" || params.actor === "MODERATOR") {
    const admin = createSupabaseAdminClient();
    const { data: staffBeat, error: staffError } = await admin
      .from("beats")
      .select("id, status, ownership_type")
      .eq("id", params.beatId)
      .maybeSingle();
    if (staffError) {
      throw new Error(staffError.message);
    }
    if (staffBeat) {
      return {
        status: staffBeat.status as BeatStatus,
        ownershipType: staffBeat.ownership_type as BeatOwnershipType,
      };
    }
  } else if (beatError) {
    throw new Error(beatError.message);
  }

  throw new AuthError("NOT_FOUND", "Beat not found.");
}

/**
 * Single Phase 1.5 Access Gate (REUSE) + Phase 1.8A DOWNLOAD limits/events
 * + P0 PLATFORM original master DOWNLOAD deny (user-facing).
 *
 * DOWNLOAD OD-17 order:
 * AuthZ (incl. ownership) → reserve slot → signed URL SUCCESS → finalize DOWNLOAD_EVENT
 * Reservation is never a DOWNLOAD_EVENT.
 *
 * PLAYBACK ≠ product DOWNLOAD. Signed PLAYBACK GET remains allowed for PLATFORM.
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

  const beat = await loadBeatForAccess({ beatId: params.beatId, actor });

  if (
    !canRequestBeatAudioAccess({
      actor,
      beatStatus: beat.status,
      purpose: params.purpose,
      ownershipType: beat.ownershipType,
    })
  ) {
    if (
      params.purpose === "DOWNLOAD" &&
      beat.ownershipType === "PLATFORM"
    ) {
      throw new AuthError(
        "FORBIDDEN",
        "Original platform beat download is not available.",
      );
    }
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
      // Limit-exempt for USER-owned masters only (PLATFORM denied above).
    } else if (actor === "ANON") {
      // ANON ≠ FREE — never resolve product FREE=4 for anonymous.
      const { tokenHash } = await ensureAnonymousDownloadIdentity();
      const dailyLimit = dailyDownloadLimitForActor({ actorType: "ANON" });
      const reserve = await reserveDownloadSlot({
        beatId: params.beatId,
        assetId: asset.id,
        actorType: "ANON",
        userId: null,
        anonymousTokenHash: tokenHash,
        dailyLimit,
      });
      if (!reserve.allowed) {
        throwLimitReached();
      }
      reservationId = reserve.reservationId;
      remainingToday = reserve.remaining;
    } else if (actor === "USER" || actor === "MODERATOR") {
      // Authenticated non-admin: limit from Product Entitlement SSOT.
      if (!profileContext) {
        throw new AuthError("UNAUTHENTICATED", "Sign in required.");
      }
      const entitlement =
        await resolveProductEntitlementForAuthContext(profileContext);
      const dailyLimit = dailyDownloadLimitForActor({
        actorType: "USER",
        downloadsDaily: entitlement.limits.downloadsDaily,
      });
      const reserve = await reserveDownloadSlot({
        beatId: params.beatId,
        assetId: asset.id,
        actorType: "USER",
        userId: profileContext.userId,
        anonymousTokenHash: null,
        dailyLimit,
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

/**
 * P0 privileged ADMIN/OPS export for PLATFORM masters.
 * Independent of user-facing DOWNLOAD purpose — never callable via DownloadButton.
 * OD-RS-R1: ALLOW for ADMIN only.
 */
export async function requestPlatformBeatOpsExport(params: {
  beatId: string;
}): Promise<PlatformBeatOpsExportResult> {
  const context = await requireRole(["ADMIN"]);

  const admin = createSupabaseAdminClient();
  const { data: beat, error: beatError } = await admin
    .from("beats")
    .select("id, status, ownership_type")
    .eq("id", params.beatId)
    .maybeSingle();

  if (beatError) {
    throw new Error(beatError.message);
  }
  if (!beat) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  if (beat.ownership_type !== "PLATFORM") {
    throw new AuthError(
      "FORBIDDEN",
      "OPS export is only for PLATFORM beats.",
    );
  }

  const asset = await resolveActiveAsset({
    beatId: params.beatId,
    purpose: "DOWNLOAD",
  });
  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset/beat relation mismatch.");
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUrl(asset.object_key, BEAT_AUDIO_DOWNLOAD_TTL_SECONDS, {
      download: true,
    });

  if (signedError || !signed?.signedUrl) {
    throw new Error(signedError?.message ?? "Failed to create signed URL.");
  }

  await insertAdminDownloadEvent({
    beatId: params.beatId,
    assetId: asset.id,
    userId: context.profile.id,
  });

  const expiresAt = new Date(
    Date.now() + BEAT_AUDIO_DOWNLOAD_TTL_SECONDS * 1000,
  ).toISOString();

  return {
    url: signed.signedUrl,
    expiresAt,
    beatId: params.beatId,
    assetId: asset.id,
    ownershipType: "PLATFORM",
    purpose: "OPS_EXPORT",
  };
}
