import "server-only";

import {
  ANONYMOUS_DAILY_DOWNLOAD_LIMIT,
  DOWNLOAD_RESERVATION_TTL_SECONDS,
  USER_DAILY_DOWNLOAD_LIMIT,
} from "@/config/downloads";
import { AuthError } from "@/lib/auth/session";
import { utcDayWindowStart } from "@/lib/downloads/limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReserveDownloadSlotResult =
  | {
      allowed: true;
      reservationId: string;
      count: number;
      limit: number;
      remaining: number;
    }
  | {
      allowed: false;
      count: number;
      limit: number;
      remaining: 0;
    };

type ReserveRpcRow = {
  allowed: boolean;
  reservation_id?: string;
  count: number;
  limit: number;
  remaining: number;
};

type FinalizeRpcRow = {
  event_id: string;
  reservation_id: string;
};

/**
 * Atomically reserves a download slot (not a DOWNLOAD_EVENT).
 * Limit = final events + unexpired reservations in UTC day.
 */
export async function reserveDownloadSlot(params: {
  beatId: string;
  assetId: string;
  actorType: "ANON" | "USER";
  userId: string | null;
  anonymousTokenHash: string | null;
}): Promise<ReserveDownloadSlotResult> {
  const dailyLimit =
    params.actorType === "ANON"
      ? ANONYMOUS_DAILY_DOWNLOAD_LIMIT
      : USER_DAILY_DOWNLOAD_LIMIT;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("reserve_beat_download_slot", {
    p_beat_id: params.beatId,
    p_asset_id: params.assetId,
    p_actor_type: params.actorType,
    p_user_id: params.userId,
    p_anonymous_token_hash: params.anonymousTokenHash,
    p_daily_limit: dailyLimit,
    p_window_start: utcDayWindowStart().toISOString(),
    p_ttl_seconds: DOWNLOAD_RESERVATION_TTL_SECONDS,
  });

  if (error) {
    throw new Error(`Download slot reservation failed: ${error.message}`);
  }

  const row = data as ReserveRpcRow | null;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Download reservation returned unexpected payload.");
  }

  if (!row.allowed) {
    return {
      allowed: false,
      count: row.count,
      limit: row.limit,
      remaining: 0,
    };
  }

  if (!row.reservation_id) {
    throw new Error("Download reservation missing reservation_id.");
  }

  return {
    allowed: true,
    reservationId: row.reservation_id,
    count: row.count,
    limit: row.limit,
    remaining: row.remaining,
  };
}

/**
 * After signed URL SUCCESS: insert FINAL DOWNLOAD_EVENT and consume reservation.
 */
export async function finalizeDownload(params: {
  reservationId: string;
  beatId: string;
  assetId: string;
}): Promise<{ eventId: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("finalize_beat_download", {
    p_reservation_id: params.reservationId,
    p_beat_id: params.beatId,
    p_asset_id: params.assetId,
  });

  if (error) {
    throw new Error(`Download finalize failed: ${error.message}`);
  }

  const row = data as FinalizeRpcRow | null;
  if (!row?.event_id) {
    throw new Error("Download finalize missing event_id.");
  }

  return { eventId: row.event_id };
}

/** URL failure / abandon — release reservation; never create DOWNLOAD_EVENT. */
export async function releaseDownloadReservation(
  reservationId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("release_beat_download_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) {
    throw new Error(`Download reservation release failed: ${error.message}`);
  }
}

export async function insertAdminDownloadEvent(params: {
  beatId: string;
  assetId: string;
  userId: string;
}): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_download_events")
    .insert({
      beat_id: params.beatId,
      asset_id: params.assetId,
      actor_type: "ADMIN",
      user_id: params.userId,
      anonymous_token_hash: null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to record admin download event.");
  }
  return data.id as string;
}

export function throwLimitReached(): never {
  throw new AuthError("FORBIDDEN", "Daily download limit reached.");
}
