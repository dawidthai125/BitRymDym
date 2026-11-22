/**
 * Public clip of a published catalogue work (owner decision 2026-11-22): /utwor/[id] and
 * /utwory play a short fragment cut on E3 from the approved master; the full master stays
 * with the author. Pure helpers shared by the E3 worker (cuts it), the catalogue service
 * (state) and the public clip route (serves it). No IO here.
 *
 * Storage: private `audio-artifacts`, next to the master:
 *   studio-master/{owner}/{project}/{masterJob}/out/master_clip.mp3
 * Served only through GET /api/catalog/works/[id]/clip (live work, rate limited, 302 to a
 * short signed URL) — never a public bucket.
 *
 * Free watermark (owner decision 2026-11-22): when the owner is on Free at the moment of the cut,
 * the clip comes from the watermarked `master_preview.mp3` (or the master watermarked on the fly
 * with the same preview functions). Paid plans get a clean clip. The plan is read once, at the cut —
 * a later plan change does not re-cut the clip.
 */
import { BEAT_PREVIEW_BITRATE, buildPreviewFfmpegArgs } from "@/lib/beats/preview/beat-preview";
import { previewKeyFor } from "@/lib/studio/master/preview";
import type { PremiumTier } from "@/types/premium";

/** Clip length (s) for a normal song. Short songs get at most half of their length. */
export const WORK_CLIP_SECONDS = 45;
/** Start = min(30 s, 25 % of the song). */
export const WORK_CLIP_MAX_START_SECONDS = 30;
export const WORK_CLIP_START_RATIO = 0.25;
/** Never more than this share of the song is public. */
export const WORK_CLIP_MAX_SHARE = 0.5;
export const WORK_CLIP_FADE_SECONDS = 1;
/** Songs shorter than this get no clip (failed: too_short). */
export const WORK_CLIP_MIN_SOURCE_SECONDS = 4;
export const WORK_CLIP_BITRATE = BEAT_PREVIEW_BITRATE;
export const WORK_CLIP_CONTENT_TYPE = "audio/mpeg";
/** Signed storage URL handed to the browser (s); the 302 itself may be cached privately a bit shorter. */
export const WORK_CLIP_SIGNED_URL_SECONDS = 300;
export const WORK_CLIP_REDIRECT_MAX_AGE_SECONDS = 240;
/** Public clip route: per work and per client IP (sliding window, studio_listen_hit). */
export const WORK_CLIP_RATE = {
  work: { limit: 1200, windowSeconds: 3600 },
  ip: { limit: 60, windowSeconds: 600 },
} as const;
/** A failed clip is queued again on the next publish save only after this long. */
export const WORK_CLIP_RETRY_AFTER_MS = 60 * 60_000;

export const WORK_CLIP_STATES = ["pending", "running", "ready", "failed"] as const;
export type WorkClipDbStatus = (typeof WORK_CLIP_STATES)[number];
/** What the public pages show: player / "Fragment w przygotowaniu". */
export type WorkClip = { state: "ready"; seconds: number } | { state: "pending" };

/** Public clip route of a work (the only URL the pages hand to a player). */
export function workClipSrc(workId: string): string {
  return `/api/catalog/works/${encodeURIComponent(workId)}/clip`;
}

/** `…/out/master.flac` → `…/out/master_clip.mp3`; null for any other key. */
export function workClipKeyFor(masterKey: string): string | null {
  return /^studio-master\/[^/]+\/[^/]+\/[^/]+\/out\/master\.flac$/.test(masterKey)
    ? masterKey.replace(/\/master\.flac$/, "/master_clip.mp3")
    : null;
}

/**
 * Where the clip is cut from:
 *   - `clean`           — paid plan: the approved master as is;
 *   - `stored_preview`  — Free (or unknown plan, fail closed): the existing watermarked `master_preview.mp3`;
 *   - `watermark_master`— Free without a stored preview: the master, watermarked on the fly first.
 * Never a clean source for Free.
 */
export type WorkClipSource =
  | { kind: "clean"; key: string }
  | { kind: "stored_preview"; key: string }
  | { kind: "watermark_master"; key: string };

export function workClipNeedsWatermark(tier: PremiumTier | null): boolean {
  return tier === null || tier === "FREE";
}

export function workClipSourceFor(p: { masterKey: string; tier: PremiumTier | null; previewExists: boolean }): WorkClipSource {
  if (!workClipNeedsWatermark(p.tier)) return { kind: "clean", key: p.masterKey };
  const preview = previewKeyFor(p.masterKey);
  return preview && p.previewExists ? { kind: "stored_preview", key: preview } : { kind: "watermark_master", key: p.masterKey };
}

const ms = (n: number) => Math.round(n * 1000) / 1000;

/** Window cut from a song of `durationSeconds`; null when unknown or too short. */
export function workClipWindow(durationSeconds: number | null | undefined): { start: number; length: number } | null {
  const d = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) ? durationSeconds : 0;
  if (d < WORK_CLIP_MIN_SOURCE_SECONDS) return null;
  const start = Math.min(WORK_CLIP_MAX_START_SECONDS, d * WORK_CLIP_START_RATIO);
  const length = Math.min(WORK_CLIP_SECONDS, d * WORK_CLIP_MAX_SHARE, d - start);
  return { start: ms(start), length: ms(length) };
}

/** ffmpeg: seek to the window, fade in/out 1 s, stereo 44.1 kHz 128 kbps MP3, no metadata. */
export function workClipFfmpegArgs(p: { input: string; output: string; start: number; length: number }): string[] {
  return buildPreviewFfmpegArgs({
    input: p.input,
    output: p.output,
    seconds: p.length,
    startSeconds: p.start,
    fadeInSeconds: WORK_CLIP_FADE_SECONDS,
    fadeSeconds: WORK_CLIP_FADE_SECONDS,
  });
}

/** DB row → public state. Anything but a ready row with a valid key is "pending" (never an error page). */
export function workClipOf(row: {
  preview_clip_status?: unknown;
  preview_clip_key?: unknown;
  preview_clip_seconds?: unknown;
} | null | undefined): WorkClip & { key?: string } {
  const seconds = Number(row?.preview_clip_seconds);
  const key = typeof row?.preview_clip_key === "string" ? row.preview_clip_key : "";
  if (row?.preview_clip_status === "ready" && /\/out\/master_clip\.mp3$/.test(key) && Number.isFinite(seconds) && seconds > 0) {
    return { state: "ready", seconds: Math.round(seconds), key };
  }
  return { state: "pending" };
}

/** Should a publish save (re)queue the clip? New → yes; failed → only after the retry delay. */
export function shouldQueueWorkClip(
  row: { preview_clip_status?: unknown; preview_clip_requested_at?: unknown } | null | undefined,
  now = Date.now(),
): boolean {
  const status = row?.preview_clip_status;
  if (status == null) return true;
  if (status !== "failed") return false;
  const at = Date.parse(String(row?.preview_clip_requested_at ?? ""));
  return !Number.isFinite(at) || now - at >= WORK_CLIP_RETRY_AFTER_MS;
}
