import "server-only";

/**
 * E3 worker — YouTube MP4 render (ffmpeg only, no sharp on E3):
 * ffprobe image size + audio length → one 1920×1080 PNG frame → H.264/AAC MP4.
 */
import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveFfmpegBin, resolveFfprobeBin, runCapture } from "@/lib/audio/native-ffmpeg";

import { ffmpegProgressFraction, youtubeEncodeArgs, youtubeFrameArgs, youtubeFrameLayout } from "./youtube-video";

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

async function fontFile(): Promise<string> {
  const fromEnv = process.env.STUDIO_VIDEO_FONT_FILE?.trim();
  for (const f of [fromEnv, ...FONT_CANDIDATES]) {
    if (!f) continue;
    try { await access(f); return f; } catch { /* next */ }
  }
  throw new Error("video_font_missing");
}

async function probeImage(file: string, timeoutMs: number): Promise<{ w: number; h: number }> {
  const out = await runCapture(resolveFfprobeBin(), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file], { timeoutMs });
  const s = (JSON.parse(out) as { streams?: { width?: number; height?: number }[] }).streams?.[0];
  if (!s?.width || !s?.height) throw new Error("video_image_unreadable");
  return { w: s.width, h: s.height };
}

export async function probeDurationS(file: string, timeoutMs: number): Promise<number> {
  const out = await runCapture(resolveFfprobeBin(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { timeoutMs });
  const d = Number(out.trim());
  if (!(d > 0)) throw new Error("video_audio_unreadable");
  return d;
}

function runWithProgress(args: string[], durationS: number, timeoutMs: number, onProgress?: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveFfmpegBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (b: Buffer) => {
      const f = ffmpegProgressFraction(b.toString("utf8"), durationS);
      if (f !== null) onProgress?.(f);
    });
    child.stderr.on("data", (b: Buffer) => { err = (err + b.toString("utf8")).slice(-400); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("video_encode_failed")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.includes("Killed") ? "video_encode_timeout" : "video_encode_failed"));
    });
  });
}

export type YoutubeRenderResult = { durationS: number; layout: string; frameMs: number; encodeMs: number };

/** `audio` (approved master) + `image` → `out` (MP4). `dir` = worker temp dir. */
export async function renderYoutubeVideo(p: {
  dir: string; image: string; audio: string; out: string;
  title: string | null; artist: string | null; timeoutMs: number;
  onStage?: (stage: "render" | "encode", fraction: number) => void;
}): Promise<YoutubeRenderResult> {
  const t0 = Date.now();
  p.onStage?.("render", 0);
  const [img, durationS] = await Promise.all([probeImage(p.image, 30_000), probeDurationS(p.audio, 30_000)]);
  const layout = youtubeFrameLayout(img, { title: p.title, artist: p.artist });
  const titleFile = p.title ? path.join(p.dir, "title.txt") : null;
  const artistFile = p.artist ? path.join(p.dir, "artist.txt") : null;
  if (titleFile) await writeFile(titleFile, p.title!, "utf8");
  if (artistFile) await writeFile(artistFile, p.artist!, "utf8");
  const frame = path.join(p.dir, "frame.png");
  const font = layout.mode === "fit" && (titleFile || artistFile) ? await fontFile() : "/dev/null";
  await runCapture(resolveFfmpegBin(), youtubeFrameArgs({ image: p.image, out: frame, layout, fontFile: font, titleFile, artistFile }), { timeoutMs: 60_000 });
  const frameMs = Date.now() - t0;
  p.onStage?.("render", 1);
  const e0 = Date.now();
  p.onStage?.("encode", 0);
  await runWithProgress(youtubeEncodeArgs({ frame, audio: p.audio, out: p.out, durationS }), durationS, p.timeoutMs, (f) => p.onStage?.("encode", f));
  return { durationS, layout: layout.mode, frameMs, encodeMs: Date.now() - e0 };
}
