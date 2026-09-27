/**
 * Client helper: session → signed PUT → finalize for take-audio.
 * Technical Wave 2 transport surface (not product QT UI).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TAKE_AUDIO_BUCKET } from "@/config/recording";

export type TakeUploadTransportResult = {
  takeId: string;
  beatId: string;
  status: "READY";
  durationSeconds: number;
  byteSize: number;
  contentType: string;
};

export async function uploadTakeRecordingBlob(params: {
  beatId: string;
  blob: Blob;
  contentType?: string;
}): Promise<TakeUploadTransportResult> {
  const contentType =
    params.contentType ??
    (params.blob.type && params.blob.type.length > 0
      ? params.blob.type
      : "audio/webm");

  const sessionRes = await fetch("/api/takes/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      beatId: params.beatId,
      contentType,
      byteSize: params.blob.size,
    }),
  });
  const sessionJson = (await sessionRes.json()) as {
    success?: boolean;
    error?: string;
    takeId?: string;
    path?: string;
    token?: string;
    contentType?: string;
  };
  if (
    !sessionRes.ok ||
    !sessionJson.success ||
    !sessionJson.takeId ||
    !sessionJson.path ||
    !sessionJson.token
  ) {
    throw new Error(sessionJson.error ?? "Take upload session failed.");
  }

  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(TAKE_AUDIO_BUCKET)
    .uploadToSignedUrl(sessionJson.path, sessionJson.token, params.blob, {
      contentType: sessionJson.contentType ?? contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Take binary upload failed.");
  }

  const finalizeRes = await fetch("/api/takes/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takeId: sessionJson.takeId }),
  });
  const finalizeJson = (await finalizeRes.json()) as TakeUploadTransportResult & {
    success?: boolean;
    error?: string;
  };
  if (!finalizeRes.ok || !finalizeJson.success) {
    throw new Error(finalizeJson.error ?? "Take finalize failed.");
  }

  return {
    takeId: finalizeJson.takeId,
    beatId: finalizeJson.beatId,
    status: "READY",
    durationSeconds: finalizeJson.durationSeconds,
    byteSize: finalizeJson.byteSize,
    contentType: finalizeJson.contentType,
  };
}
