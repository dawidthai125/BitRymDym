/**
 * Client helper: session → signed PUT → finalize for take-audio.
 * Technical Wave 2 transport surface (not product QT UI).
 * D02: anonymous path uses /api/takes/anon/* (cookie identity server-side).
 * P2: optional replaceTakeId for explicit sample replacement.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { toUserFacingError } from "@/lib/ui/user-errors";
import type { ReplaceableTakeSummary } from "@/lib/takes/claim-errors";

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
  if (/Replace failed/i.test(message)) {
    return "Nie udało się zastąpić nagrania.";
  }
  if (/REPLACE_REQUIRED/i.test(message)) {
    return "Masz pełny limit nagrań — wybierz nagranie do zastąpienia.";
  }
  if (/REPLACE_OWNERSHIP_DENIED/i.test(message)) {
    return "Nie możesz zastąpić cudzego nagrania.";
  }
  if (/REPLACE_EXPIRED/i.test(message)) {
    return "Wybrane nagranie wygasło.";
  }
  if (/REPLACE_NOT_READY|REPLACE_INVALID|REPLACE_CONFLICT/i.test(message)) {
    return "Wybrane nagranie nie nadaje się do zastąpienia.";
  }
  if (
    /contentType is not in take interim allow-list/i.test(message) ||
    /INVALID_MIME/i.test(message)
  ) {
    return "Nieobsługiwany format pliku. Wybierz MP3, WAV, M4A lub AAC.";
  }
  if (
    /byteSize must be at most/i.test(message) ||
    /Invalid take byte size/i.test(message) ||
    /INVALID_SIZE/i.test(message)
  ) {
    return "Plik jest za duży lub ma nieprawidłowy rozmiar.";
  }
  if (
    /Duration \d+s exceeds max/i.test(message) ||
    /DURATION_EXCEEDED/i.test(message) ||
    /exceeds max \d+s/i.test(message)
  ) {
    return "Plik jest za długi względem limitu nagrania dla tego bitu.";
  }
  if (
    /Duration could not be verified/i.test(message) ||
    /DURATION_PROBE_FAILED/i.test(message)
  ) {
    return "Nie udało się odczytać czasu trwania pliku audio.";
  }
  // Central mapper — never return raw English backend text.
  return toUserFacingError(message, "recording");
}

export type TakeUploadTransportResult = {
  takeId: string;
  beatId: string;
  status: "READY";
  durationSeconds: number;
  byteSize: number;
  contentType: string;
};

export class TakeReplaceRequiredError extends Error {
  readonly code = "REPLACE_REQUIRED" as const;
  readonly replaceableTakes: ReplaceableTakeSummary[];

  constructor(replaceableTakes: ReplaceableTakeSummary[], message?: string) {
    super(
      message ??
        "REPLACE_REQUIRED: Active READY take limit reached — choose a sample to replace.",
    );
    this.name = "TakeReplaceRequiredError";
    this.replaceableTakes = replaceableTakes;
  }
}

async function runTakeUploadTransport(params: {
  beatId: string;
  blob: Blob;
  contentType?: string;
  replaceTakeId?: string | null;
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
      replaceTakeId: params.replaceTakeId ?? null,
    }),
  });
  const sessionJson = (await sessionRes.json()) as {
    success?: boolean;
    error?: string;
    code?: string;
    replaceableTakes?: ReplaceableTakeSummary[];
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
    if (
      sessionJson.code === "REPLACE_REQUIRED" ||
      /REPLACE_REQUIRED/i.test(sessionJson.error ?? "")
    ) {
      throw new TakeReplaceRequiredError(
        sessionJson.replaceableTakes ?? [],
        sessionJson.error,
      );
    }
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
  replaceTakeId?: string | null;
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
  replaceTakeId?: string | null;
}): Promise<TakeUploadTransportResult> {
  return runTakeUploadTransport({
    ...params,
    sessionPath: "/api/takes/anon/session",
    finalizePath: "/api/takes/anon/finalize",
  });
}
