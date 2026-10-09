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
