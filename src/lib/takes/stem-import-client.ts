/**
 * Studio stem import — client helpers (pure). Silver/Gold import several audio files at once;
 * each one becomes a track. Server re-validates size, type, duration and the per-project cap.
 */
import { STEM_AUDIO_MAX_BYTES } from "@/config/recording";
import { resolveStudioVocalImportContentType, STUDIO_VOCAL_IMPORT_ACCEPT } from "@/lib/takes/studio-vocal-import";
import { validateTakeUploadMeta } from "@/lib/takes/validation";

/** File input accept — same formats as vocal import. */
export const STEM_IMPORT_ACCEPT = STUDIO_VOCAL_IMPORT_ACCEPT;

export type StemGate = { ok: true; contentType: string; byteSize: number } | { ok: false; message: string };

export function gateStemFile(file: { name: string; type: string; size: number }): StemGate {
  const contentType = resolveStudioVocalImportContentType(file);
  if (!contentType) {
    return { ok: false, message: `${file.name}: nieobsługiwany format. Wybierz WAV, MP3, M4A lub AAC.` };
  }
  const mb = Math.round(STEM_AUDIO_MAX_BYTES / (1024 * 1024));
  if (file.size > STEM_AUDIO_MAX_BYTES) {
    return { ok: false, message: `${file.name}: plik ma więcej niż ${mb} MB. Wyeksportuj go jako MP3 albo skróć.` };
  }
  const meta = validateTakeUploadMeta({ contentType, byteSize: file.size, maxBytes: STEM_AUDIO_MAX_BYTES });
  if (!meta.ok) return { ok: false, message: `${file.name}: ${meta.errors[0] ?? "nieprawidłowy plik"}.` };
  return { ok: true, contentType: meta.contentType, byteSize: file.size };
}

export type StemQueueItem = { file: File; contentType: string };

/**
 * Split a file selection into what we will import and what we skip (bad format, too big, or no free slot).
 * `slotsLeft` = min(plan stems left, free track slots).
 */
export function planStemImport(
  files: ArrayLike<{ name: string; type: string; size: number }>,
  slotsLeft: number,
): { accepted: number[]; rejected: string[] } {
  const accepted: number[] = [];
  const rejected: string[] = [];
  const room = Math.max(0, Math.floor(slotsLeft));
  for (let i = 0; i < files.length; i++) {
    const gate = gateStemFile(files[i]);
    if (!gate.ok) {
      rejected.push(gate.message);
    } else if (accepted.length >= room) {
      rejected.push(`${files[i].name}: brak wolnych ścieżek w planie.`);
    } else {
      accepted.push(i);
    }
  }
  return { accepted, rejected };
}

/** Track name from a file name: "vocal_main.final.wav" → "vocal main.final", max 40 chars. */
export function stemTrackName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").replace(/[_]+/g, " ").trim();
  return (base || "Stem").slice(0, 40);
}

/** Guess the track role from the file name ("Lead Vocal.wav" → lead_vocal, "808 bass.mp3" → instrument). */
export function guessStemRole(fileName: string): "lead_vocal" | "adlib" | "double" | "backing" | "instrument" | "other" {
  const n = fileName.toLowerCase();
  if (/ad[\s_-]?lib/.test(n)) return "adlib";
  if (/(^|[^a-z])(dbl|double|dubel|dubl)/.test(n)) return "double";
  if (/(back|choir|chor|harm|chór)/.test(n)) return "backing";
  if (/(vocal|vox|lead|wokal|rap|acapella|acappella)/.test(n)) return "lead_vocal";
  if (/(beat|drum|kick|snare|hat|bass|808|keys|piano|synth|guitar|gitara|pad|strings|inst)/.test(n)) return "instrument";
  return "other";
}
