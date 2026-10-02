/**
 * Client helper: session → signed PUT → finalize for take-audio.
 * Technical Wave 2 transport surface (not product QT UI).
 * D02: anonymous path uses /api/takes/anon/* (cookie identity server-side).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TAKE_AUDIO_BUCKET } from "@/config/recording";

/** Map transport/API errors to Polish before they reach user-facing UI. */
export function toUserFacingTakeUploadError(message: string): string {
  if (/Take upload session failed/i.test(message)) {
    return "Nie udało się rozpocząć przesyłania nagrania.";
  }
  if (/Take binary upload failed/i.test(message)) {
    return "Nie udało się przesłać nagrania.";
  }
  if (/Take finalize failed/i.test(message) || /Anonymous take finalize failed/i.test(message)) {
    return "Nie udało się sfinalizować nagrania.";
  }
  if (/Upload\/finalize failed/i.test(message)) {
    return "Nie udało się przesłać ani sfinalizować nagrania.";
  }
  if (/Anonymous take session failed/i.test(message) || /Take session failed/i.test(message)) {
    return "Nie udało się utworzyć sesji nagrania.";
  }
  if (/Take preview failed|Anonymous take preview failed/i.test(message)) {
    return "Nie udało się otworzyć podglądu nagrania.";
  }
  if (/Take download failed/i.test(message)) {
    return "Nie udało się pobrać nagrania.";
  }
  if (/Take delete failed/i.test(message)) {
    return "Nie udało się usunąć nagrania.";
  }
  if (/MediaRecorder unavailable/i.test(message)) {
    return "Nagrywanie nie jest dostępne w tej przeglądarce.";
  }
  if (/getUserMedia failed/i.test(message)) {
    return "Nie udało się uzyskać dostępu do mikrofonu.";
  }
  if (/stop failed/i.test(message)) {
    return "Nie udało się zatrzymać nagrania.";
  }
  if (/expired/i.test(message)) {
    return "Sesja nagrania wygasła.";
  }
  // Already Polish (contains diacritics or known PL words) — pass through.
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(message) || /\b(nagrania|nagranie|mikrofon|sesji|podgląd)\b/i.test(message)) {
    return message;
  }
  // Generic English/technical fallback — never show raw EN to the user.
  if (/\b(failed|error|unavailable|denied|timeout)\b/i.test(message)) {
    return "Nie udało się przesłać nagrania. Spróbuj ponownie.";
  }
  return message;
}

export type TakeUploadTransportResult = {
  takeId: string;
  beatId: string;
  status: "READY";
  durationSeconds: number;
  byteSize: number;
  contentType: string;
};

async function runTakeUploadTransport(params: {
  beatId: string;
  blob: Blob;
  contentType?: string;
  sessionPath: string;
  finalizePath: string;
}): Promise<TakeUploadTransportResult> {
  const contentType =
    params.contentType ??
    (params.blob.type && params.blob.type.length > 0
      ? params.blob.type
      : "audio/webm");

  const sessionRes = await fetch(params.sessionPath, {
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
    throw new Error(
      toUserFacingTakeUploadError(
        sessionJson.error ?? "Take upload session failed.",
      ),
    );
  }

  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(TAKE_AUDIO_BUCKET)
    .uploadToSignedUrl(sessionJson.path, sessionJson.token, params.blob, {
      contentType: sessionJson.contentType ?? contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      toUserFacingTakeUploadError(
        uploadError.message || "Take binary upload failed.",
      ),
    );
  }

  const finalizeRes = await fetch(params.finalizePath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takeId: sessionJson.takeId }),
  });
  const finalizeJson = (await finalizeRes.json()) as TakeUploadTransportResult & {
    success?: boolean;
    error?: string;
  };
  if (!finalizeRes.ok || !finalizeJson.success) {
    throw new Error(
      toUserFacingTakeUploadError(
        finalizeJson.error ?? "Take finalize failed.",
      ),
    );
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

export async function uploadTakeRecordingBlob(params: {
  beatId: string;
  blob: Blob;
  contentType?: string;
}): Promise<TakeUploadTransportResult> {
  return runTakeUploadTransport({
    ...params,
    sessionPath: "/api/takes/session",
    finalizePath: "/api/takes/finalize",
  });
}

export async function uploadAnonTakeRecordingBlob(params: {
  beatId: string;
  blob: Blob;
  contentType?: string;
}): Promise<TakeUploadTransportResult> {
  return runTakeUploadTransport({
    ...params,
    sessionPath: "/api/takes/anon/session",
    finalizePath: "/api/takes/anon/finalize",
  });
}
