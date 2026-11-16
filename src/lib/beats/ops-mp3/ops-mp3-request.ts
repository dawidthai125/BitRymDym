/**
 * Vercel admin path: queue Contabo WAV→MP3 and sign the READY asset.
 */
import "server-only";

import { rewriteThroughAudioEdge } from "@/lib/audio/audio-edge";
import { AuthError, requireRole } from "@/lib/auth/session";
import { BEAT_AUDIO_DOWNLOAD_TTL_SECONDS } from "@/lib/beats/audio-validation";
import { GENERATED_BEAT_TAG } from "@/lib/beats/catalog-lane";
import {
  isOpsMp3Fresh,
  tagsWithOpsMp3Wanted,
} from "@/lib/beats/ops-mp3/ops-mp3";
import { BeatRequestError } from "@/lib/beats/request-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AssetRow = {
  id: string;
  status: string;
  is_active: boolean;
  object_key: string;
  storage_bucket: string;
  original_filename: string | null;
  content_type: string | null;
};

const ASSET_COLS =
  "id, status, is_active, object_key, storage_bucket, original_filename, content_type";

export type OpsMp3DownloadState =
  | { status: "ready"; url: string; expiresAt: string; fileName: string }
  | { status: "pending" }
  | { status: "error"; error: string };

function isMpeg(contentType: string | null): boolean {
  const raw = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return raw === "audio/mpeg" || raw === "audio/mp3";
}

/**
 * Admin waiting catalogue: return a signed MP3 URL, or mark the Contabo queue.
 */
export async function requestWaitingOpsMp3Download(params: {
  beatId: string;
  title: string;
}): Promise<OpsMp3DownloadState> {
  await requireRole(["ADMIN"]);
  const admin = createSupabaseAdminClient();

  const { data: beat, error: beatErr } = await admin
    .from("beats")
    .select("id, ownership_type, status, tags, title")
    .eq("id", params.beatId)
    .maybeSingle();
  if (beatErr) throw new Error(beatErr.message);
  if (!beat || beat.ownership_type !== "PLATFORM") {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  if (beat.status !== "DRAFT") {
    throw new BeatRequestError("MP3 z kolejki tylko dla szkiców oczekujących.");
  }
  const tags = beat.tags;
  if (!Array.isArray(tags) || !tags.includes(GENERATED_BEAT_TAG)) {
    throw new BeatRequestError("To nie jest bit z generatora.");
  }

  const { data: master, error: mErr } = await admin
    .from("beat_audio_assets")
    .select(ASSET_COLS)
    .eq("beat_id", params.beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!master) {
    return { status: "error", error: "Brak gotowego mastera audio." };
  }
  const masterRow = master as AssetRow;

  const { data: current } = await admin
    .from("beat_audio_assets")
    .select(ASSET_COLS)
    .eq("beat_id", params.beatId)
    .eq("purpose", "DOWNLOAD")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  const currentRow = (current as AssetRow | null) ?? null;

  if (isOpsMp3Fresh({ asset: currentRow, masterAssetId: masterRow.id })) {
    return signOpsMp3(admin, currentRow!, params.title);
  }

  if (isMpeg(masterRow.content_type)) {
    return signOpsMp3(admin, masterRow, params.title);
  }

  const nextTags = tagsWithOpsMp3Wanted(tags);
  const { error: tagErr } = await admin
    .from("beats")
    .update({ tags: nextTags })
    .eq("id", params.beatId);
  if (tagErr) throw new Error(tagErr.message);
  return { status: "pending" };
}

async function signOpsMp3(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  asset: AssetRow,
  title: string,
): Promise<Extract<OpsMp3DownloadState, { status: "ready" }>> {
  const { data: signed, error } = await admin.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.object_key, BEAT_AUDIO_DOWNLOAD_TTL_SECONDS, {
      download: true,
    });
  if (error || !signed?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed URL.");
  }
  const base =
    title
      .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "bitrymdym-platform";
  return {
    status: "ready",
    url: rewriteThroughAudioEdge(signed.signedUrl),
    expiresAt: new Date(Date.now() + BEAT_AUDIO_DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
    fileName: `${base}.mp3`,
  };
}
