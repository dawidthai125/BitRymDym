/**
 * Studio AI vocal file import — client helpers.
 * Reuses take-audio MIME/size SSOT; server finalize remains duration AuthZ.
 */

import { TAKE_AUDIO_MAX_BYTES } from "@/config/recording";
import {
  normalizeTakeContentType,
  validateTakeUploadMeta,
} from "@/lib/takes/validation";

/** HTML file input accept — mirrors take interim allow-list. */
export const STUDIO_VOCAL_IMPORT_ACCEPT =
  "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac";

const EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

/**
 * Resolve Content-Type for session/upload.
 * Prefer File.type when allow-listed; else extension hint (Windows often sends empty/octet-stream).
 */
export function resolveStudioVocalImportContentType(file: {
  name: string;
  type: string;
}): string | null {
  const fromType = normalizeTakeContentType(file.type || "");
  if (fromType) return fromType;

  const ext = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  const mapped = EXT_TO_MIME[ext];
  if (!mapped) return null;
  return normalizeTakeContentType(mapped);
}

export type StudioVocalImportClientGate =
  | { ok: true; contentType: string; byteSize: number }
  | { ok: false; message: string };

/** Client pre-gate only — server re-validates size/MIME/duration. */
export function gateStudioVocalImportFile(file: {
  name: string;
  type: string;
  size: number;
}): StudioVocalImportClientGate {
  const contentType = resolveStudioVocalImportContentType(file);
  if (!contentType) {
    return {
      ok: false,
      message:
        "Nieobsługiwany format pliku. Wybierz MP3, WAV, M4A lub AAC.",
    };
  }
  const meta = validateTakeUploadMeta({
    contentType,
    byteSize: file.size,
  });
  if (!meta.ok) {
    if (meta.errors.some((e) => /byteSize/i.test(e))) {
      return {
        ok: false,
        message: `Plik jest za duży. Maksymalny rozmiar to ${Math.floor(TAKE_AUDIO_MAX_BYTES / (1024 * 1024))} MB.`,
      };
    }
    return {
      ok: false,
      message:
        "Nieobsługiwany format pliku. Wybierz MP3, WAV, M4A lub AAC.",
    };
  }
  return {
    ok: true,
    contentType: meta.contentType,
    byteSize: file.size,
  };
}

/** Message shown when an imported file is longer than the beat's take cap. */
export const STUDIO_VOCAL_IMPORT_TOO_LONG_MESSAGE =
  "Plik jest za długi względem limitu nagrania dla tego bitu.";

/** Pure check: true only when the duration is known and exceeds the cap. */
export function isStudioVocalImportTooLong(
  durationSeconds: number | null,
  maxRecordingSeconds: number,
): boolean {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) return false;
  if (!Number.isFinite(maxRecordingSeconds) || maxRecordingSeconds <= 0) return false;
  return Math.ceil(durationSeconds) > Math.floor(maxRecordingSeconds);
}

/**
 * Reads duration from file metadata in the browser. Returns null when it cannot
 * be read in time; the server still validates, this only avoids reserving a take.
 */
export function probeStudioVocalImportDurationSeconds(
  file: Blob,
  timeoutMs = 5000,
): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : null,
      );
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}
