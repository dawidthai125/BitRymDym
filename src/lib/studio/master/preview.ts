/**
 * Master preview with a voice watermark. Pure helpers shared by the worker (builds it) and the job API (serves it).
 *
 * The clean master (FLAC) is never handed to the browser for playback: the studio plays this 128 kbps MP3 with
 * the voice tag "Bit Rym Dym" mixed in every 15 s. The clean file is only delivered through the approved,
 * quota-counted download jobs.
 */

/** First tag after this many ms, then every PREVIEW_TAG_EVERY_S seconds. */
export const PREVIEW_TAG_FIRST_MS = 3000;
export const PREVIEW_TAG_EVERY_S = 15;
export const PREVIEW_BITRATE = "128k";

/** `…/out/master.flac` → `…/out/master_preview.mp3`; null for any other key. */
export function previewKeyFor(resultKey: string): string | null {
  return /\/master\.flac$/.test(resultKey) ? resultKey.replace(/\/master\.flac$/, "/master_preview.mp3") : null;
}

/** One tag padded to the repeat interval, with the first tag delayed (looped later by -stream_loop). */
export function tagCycleArgs(tagWav: string, out: string): string[] {
  return ["-hide_banner", "-loglevel", "error", "-y", "-i", tagWav, "-af", `adelay=${PREVIEW_TAG_FIRST_MS},apad=whole_dur=${PREVIEW_TAG_EVERY_S}`, "-ar", "44100", "-ac", "1", out];
}

/** Master + looped tag cycle → MP3. Stereo tag, limiter after the mix so the tag never clips the music. */
export function previewMixArgs(master: string, tagCycle: string, out: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", master,
    "-stream_loop", "-1", "-i", tagCycle,
    "-filter_complex",
    "[1:a]aformat=channel_layouts=stereo[t];[0:a][t]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[o]",
    "-map", "[o]",
    "-c:a", "libmp3lame", "-b:a", PREVIEW_BITRATE, "-ar", "44100",
    out,
  ];
}

/**
 * Enforcement switch. OFF (default): a master without a preview (made before the worker update) still plays
 * the clean file, so nothing breaks while the worker is being updated. ON (STUDIO_MASTER_PREVIEW_ENFORCE=1,
 * set after the E3 worker builds previews): the clean file is never played before approval.
 */
export function masterPreviewEnforced(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.STUDIO_MASTER_PREVIEW_ENFORCE ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Which URL the studio may play for a master job. With enforcement on, never the clean file before approval. */
export function masterPlaybackChoice(input: { previewExists: boolean; approved: boolean; enforce?: boolean }): "preview" | "clean" | "none" {
  if (input.previewExists) return "preview";
  return input.approved || !input.enforce ? "clean" : "none";
}
