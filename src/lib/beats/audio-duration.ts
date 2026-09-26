import "server-only";

import { parseBuffer } from "music-metadata";

import { validateAudioUploadMeta } from "@/lib/beats/audio-validation";
import { suggestTitleFromFilename } from "@/lib/beats/filename-title";
import {
  BEAT_DURATION_MAX,
  BEAT_DURATION_MIN,
} from "@/lib/beats/validation";

/**
 * Rounding rule for music-metadata float seconds → integer duration_seconds:
 * Math.round (half-up). Then enforce BEAT_DURATION_MIN..BEAT_DURATION_MAX.
 */
export function roundDurationSeconds(rawSeconds: number): number {
  return Math.round(rawSeconds);
}

export type AudioDurationProbeResult =
  | {
      ok: true;
      durationSeconds: number;
      durationRawSeconds: number;
    }
  | { ok: false; error: string };

/**
 * Probe audio bytes for duration (server source of truth).
 * Does not trust client-supplied duration.
 */
export async function probeAudioDurationFromBytes(params: {
  bytes: Uint8Array;
  contentTypeHint?: string | null;
}): Promise<AudioDurationProbeResult> {
  if (!params.bytes.length) {
    return { ok: false, error: "Plik audio jest pusty." };
  }

  try {
    const metadata = await parseBuffer(
      Buffer.from(params.bytes),
      params.contentTypeHint
        ? { mimeType: params.contentTypeHint }
        : undefined,
      { duration: true },
    );

    const raw = metadata.format.duration;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      return {
        ok: false,
        error: "Nie udało się odczytać czasu trwania z pliku audio.",
      };
    }

    const durationSeconds = roundDurationSeconds(raw);
    if (durationSeconds < BEAT_DURATION_MIN) {
      return {
        ok: false,
        error: `Czas trwania musi wynosić co najmniej ${BEAT_DURATION_MIN} s.`,
      };
    }
    if (durationSeconds > BEAT_DURATION_MAX) {
      return {
        ok: false,
        error: `Czas trwania nie może przekraczać ${BEAT_DURATION_MAX} s (wykryto ${durationSeconds} s).`,
      };
    }

    return {
      ok: true,
      durationSeconds,
      durationRawSeconds: raw,
    };
  } catch {
    return {
      ok: false,
      error: "Nie udało się przeanalizować pliku audio.",
    };
  }
}

export type AnalyzedBeatAudio =
  | {
      ok: true;
      durationSeconds: number;
      byteSize: number;
      contentType: string;
      titleSuggestion: string;
    }
  | { ok: false; error: string };

/**
 * Full server-side audio gate for create-with-master: MIME/size + duration.
 */
export async function analyzeBeatAudioBytes(params: {
  bytes: Uint8Array;
  contentType: string;
  originalFilename?: string | null;
}): Promise<AnalyzedBeatAudio> {
  const meta = validateAudioUploadMeta({
    contentType: params.contentType,
    byteSize: params.bytes.byteLength,
  });
  if (!meta.ok) {
    return { ok: false, error: meta.errors.join("; ") };
  }

  const probe = await probeAudioDurationFromBytes({
    bytes: params.bytes,
    contentTypeHint: params.contentType,
  });
  if (!probe.ok) {
    return { ok: false, error: probe.error };
  }

  return {
    ok: true,
    durationSeconds: probe.durationSeconds,
    byteSize: params.bytes.byteLength,
    contentType: params.contentType,
    titleSuggestion: suggestTitleFromFilename(params.originalFilename),
  };
}
