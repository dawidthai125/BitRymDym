import "server-only";

import { rewriteThroughAudioEdge } from "@/lib/audio/audio-edge";
import { AuthError, requireUser } from "@/lib/auth/session";
import { BEAT_AUDIO_BUCKET, BEAT_AUDIO_DOWNLOAD_TTL_SECONDS, isUuid } from "@/lib/beats/audio-validation";
import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { isPurchasedWavContentType } from "@/lib/payments/beat-wav";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PurchasedWavResult =
  | { ok: true; url: string }
  | { ok: false; code: "login" | "denied" | "missing" };

function wavDownloadName(title: string): string {
  const clean = title.replace(/[^\p{L}\p{N} ._-]+/gu, "").trim().slice(0, 80);
  return `${clean || "bit"}.wav`;
}

/**
 * Signed download of the wav the buyer paid for.
 * This is not the user-facing DOWNLOAD purpose and does not unlock other platform masters.
 */
export async function requestPurchasedBeatWav(beatId: string): Promise<PurchasedWavResult> {
  if (!isUuid(beatId)) return { ok: false, code: "denied" };
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, code: "login" };
    throw error;
  }
  if (!isUuid(userId)) return { ok: false, code: "denied" };

  const admin = createSupabaseAdminClient();
  const purchase = await admin.from("beat_purchases").select("id").eq("user_id", userId).eq("beat_id", beatId).maybeSingle();
  if (purchase.error || !purchase.data) return { ok: false, code: "denied" };

  const beat = await admin
    .from("beats")
    .select("id, title, status, ownership_type, catalog_lane")
    .eq("id", beatId)
    .maybeSingle();
  if (beat.error || !beat.data) return { ok: false, code: "missing" };
  const row = beat.data as {
    title?: string | null;
    status?: string;
    ownership_type?: string;
    catalog_lane?: string | null;
  };
  if (row.status !== "PUBLISHED" || row.ownership_type !== "PLATFORM" || catalogLaneOf(row.catalog_lane) !== "paid") {
    return { ok: false, code: "denied" };
  }

  const asset = await admin
    .from("beat_audio_assets")
    .select("object_key, content_type")
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (asset.error || !asset.data) return { ok: false, code: "missing" };
  const file = asset.data as { object_key?: string; content_type?: string | null };
  if (typeof file.object_key !== "string" || !file.object_key || file.object_key.includes("..")) {
    return { ok: false, code: "missing" };
  }
  if (!isPurchasedWavContentType(file.content_type)) return { ok: false, code: "missing" };

  const { data: signed, error: signedError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUrl(file.object_key, BEAT_AUDIO_DOWNLOAD_TTL_SECONDS, {
      download: wavDownloadName(typeof row.title === "string" ? row.title : ""),
    });
  if (signedError || !signed?.signedUrl) return { ok: false, code: "missing" };
  return { ok: true, url: rewriteThroughAudioEdge(signed.signedUrl) };
}
