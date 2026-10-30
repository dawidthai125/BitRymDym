/**
 * Gold — YouTube video (MP4) from the approved master + one image (pure, shared by API,
 * UI and the E3 worker). The worker builds one 1920×1080 frame with ffmpeg (blurred,
 * darkened fill + the image fitted on top + optional title / artist), then loops it
 * over the master: H.264 (yuv420p, stillimage) + AAC 320k / 48 kHz, faststart.
 * Rendered on E3 (not in the browser): same output on every device, the master is
 * already in storage (nothing big goes up from a phone), AAC encoding in WebCodecs is
 * missing on Firefox, Chrome on Linux and older iOS Safari.
 */
import { youtubeVideoForTier } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

export const YT_VIDEO_W = 1920;
export const YT_VIDEO_H = 1080;
export const YT_VIDEO_FPS = 24;
export const YT_VIDEO_TEXT_MAX = 80;
/** Video jobs per Warsaw day (each one is a few CPU-minutes on E3). */
export const YT_VIDEO_PER_DAY = 20;
/** Own graphic upload (same checks as beat covers; aspect is kept, not cropped). */
export const YT_VIDEO_IMAGE_MAX_PX = 2560;

export type YoutubeVideoSource = "cover" | "upload";

/** What the job row carries in `video` (jsonb, ≤ 2 KB). */
export type YoutubeVideoSpec = {
  source: YoutubeVideoSource;
  image: { bucket: "beat-covers" | "audio-artifacts"; key: string };
  title: string | null;
  artist: string | null;
};

export function youtubeVideoAllowed(tier: PremiumTier | null | undefined): boolean {
  return !!tier && youtubeVideoForTier(tier);
}

export type YoutubeVideoDeny = "tier_video" | "not_approved" | "bad_request" | "image_missing" | "daily_limit";

/** Server gate (UI mirrors it). Order: plan first, so lower plans always get the upsell. */
export function decideYoutubeVideo(p: { tier: PremiumTier | null; approved: boolean; source: unknown; hasImage: boolean }):
  { allowed: true } | { allowed: false; reason: YoutubeVideoDeny } {
  if (!youtubeVideoAllowed(p.tier)) return { allowed: false, reason: "tier_video" };
  if (p.source !== "cover" && p.source !== "upload") return { allowed: false, reason: "bad_request" };
  if (!p.approved) return { allowed: false, reason: "not_approved" };
  if (!p.hasImage) return { allowed: false, reason: "image_missing" };
  return { allowed: true };
}

/** One line of on-screen text: no control chars, single spaces, ≤ 80 chars; empty → null. */
export function cleanVideoText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return Array.from(s).slice(0, YT_VIDEO_TEXT_MAX).join("").trim() || null;
}

export function isYoutubeVideoSpec(v: unknown): v is YoutubeVideoSpec {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const img = o.image as Record<string, unknown> | undefined;
  return (o.source === "cover" || o.source === "upload")
    && !!img && (img.bucket === "beat-covers" || img.bucket === "audio-artifacts")
    && typeof img.key === "string" && SAFE_KEY.test(img.key) && !img.key.includes("..")
    && (o.title === null || typeof o.title === "string") && (o.artist === null || typeof o.artist === "string");
}

const SAFE_KEY = /^[\w./-]{1,300}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Own graphic (passed the content filter) — opaque key under the owner + project. */
export function youtubeImageKey(ownerId: string, projectId: string, imageId: string): string {
  for (const id of [ownerId, projectId, imageId]) if (!UUID.test(id)) throw new Error("bad_id");
  return `studio-video/${ownerId}/${projectId}/img/${imageId}.jpg`;
}

export type FrameLayout =
  | { mode: "full" }
  | { mode: "fit"; box: { w: number; h: number }; y: number; title: { size: number; y: number } | null; artist: { size: number; y: number } | null };

const near169 = (w: number, h: number) => w > 0 && h > 0 && Math.abs(w / h - 16 / 9) < 0.02;

/** Font size so the line fits 1720 px (DejaVu Sans Bold ≈ 0.62 em per char). */
function fitSize(text: string, max: number, min: number): number {
  const n = Math.max(1, Array.from(text).length);
  return Math.max(min, Math.min(max, Math.floor(1720 / (n * 0.62))));
}

/**
 * 16:9 image without text → full frame. Otherwise the image is fitted (never cropped)
 * on the blurred fill; with text it sits higher and the lines go underneath.
 */
export function youtubeFrameLayout(img: { w: number; h: number }, text: { title: string | null; artist: string | null }): FrameLayout {
  const hasText = !!(text.title || text.artist);
  if (!hasText && near169(img.w, img.h)) return { mode: "full" };
  if (!hasText) return { mode: "fit", box: { w: 1760, h: 960 }, y: 60, title: null, artist: null };
  const title = text.title ? { size: fitSize(text.title, 72, 34), y: 0 } : null;
  const artist = text.artist ? { size: fitSize(text.artist, 48, 28), y: 0 } : null;
  const textH = (title ? title.size + 24 : 0) + (artist ? artist.size + 16 : 0);
  const boxH = YT_VIDEO_H - 70 - 50 - textH - 40;
  let y = 70 + boxH + 40;
  if (title) { title.y = y; y += title.size + 24; }
  if (artist) artist.y = y;
  return { mode: "fit", box: { w: 1760, h: boxH }, y: 70, title, artist };
}

const SAFE_PATH = /^[\w/.-]+$/;
function safePath(p: string): string {
  if (!SAFE_PATH.test(p)) throw new Error("unsafe_path");
  return p;
}

/**
 * ffmpeg args → one PNG frame. Text comes from files (textfile=, expansion=none), so user
 * text is never parsed by the filter graph. All paths are worker temp paths (checked).
 */
export function youtubeFrameArgs(p: {
  image: string; out: string; layout: FrameLayout; fontFile: string;
  titleFile?: string | null; artistFile?: string | null;
}): string[] {
  const W = YT_VIDEO_W, H = YT_VIDEO_H;
  let graph: string;
  if (p.layout.mode === "full") {
    graph = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,format=rgb24[v]`;
  } else {
    const L = p.layout;
    const bg = `[a]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W}:${H},setsar=1,gblur=sigma=48,colorchannelmixer=rr=0.42:gg=0.42:bb=0.42[bg]`;
    const fg = `[b]scale=${L.box.w}:${L.box.h}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[fg]`;
    let chain = `[bg][fg]overlay=x=(W-w)/2:y=${L.y}+(${L.box.h}-h)/2,format=rgb24`;
    const font = safePath(p.fontFile);
    const shadow = "shadowcolor=black@0.55:shadowx=0:shadowy=3";
    if (L.title && p.titleFile) chain += `,drawtext=fontfile=${font}:textfile=${safePath(p.titleFile)}:expansion=none:fontsize=${L.title.size}:fontcolor=white:x=(w-text_w)/2:y=${L.title.y}:${shadow}`;
    if (L.artist && p.artistFile) chain += `,drawtext=fontfile=${font}:textfile=${safePath(p.artistFile)}:expansion=none:fontsize=${L.artist.size}:fontcolor=white@0.82:x=(w-text_w)/2:y=${L.artist.y}:${shadow}`;
    graph = `[0:v]split=2[a][b];${bg};${fg};${chain}[v]`;
  }
  return ["-hide_banner", "-loglevel", "error", "-y", "-i", safePath(p.image), "-filter_complex", graph, "-map", "[v]", "-frames:v", "1", safePath(p.out)];
}

/** ffmpeg args → MP4: the frame looped for exactly the audio length, H.264 + AAC. */
export function youtubeEncodeArgs(p: { frame: string; audio: string; out: string; durationS: number }): string[] {
  if (!(p.durationS > 0) || !Number.isFinite(p.durationS)) throw new Error("bad_duration");
  return [
    "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", "-y",
    "-loop", "1", "-framerate", String(YT_VIDEO_FPS), "-i", safePath(p.frame),
    "-i", safePath(p.audio),
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "20", "-pix_fmt", "yuv420p",
    "-r", String(YT_VIDEO_FPS), "-g", String(YT_VIDEO_FPS * 2),
    "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
    "-t", p.durationS.toFixed(3), "-shortest",
    "-movflags", "+faststart", "-f", "mp4", safePath(p.out),
  ];
}

/** `-progress pipe:1` chunk → fraction done (0..1) or null. */
export function ffmpegProgressFraction(chunk: string, durationS: number): number | null {
  let us: number | null = null;
  for (const m of chunk.matchAll(/out_time_(?:us|ms)=(\d+)/g)) us = Number(m[1]);
  if (us === null || !(durationS > 0)) return null;
  return Math.min(1, Math.max(0, us / 1e6 / durationS));
}
