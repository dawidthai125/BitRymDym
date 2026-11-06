import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { resolveFfprobeBin } from "@/lib/audio/native-ffmpeg";

import { renderYoutubeVideo } from "./render";

const DIR = "tmp-studio-yt-mp4";
const TEMP_FF = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Temp", "ffbin", "node_modules")
  : "";
const FFMPEG_FALLBACK = TEMP_FF ? path.join(TEMP_FF, "ffmpeg-static", "ffmpeg.exe") : "";
const FFPROBE_FALLBACK = TEMP_FF ? path.join(TEMP_FF, "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe") : "";

const prevFfmpeg = process.env.E3_FFMPEG_PATH;
const prevFfprobe = process.env.E3_FFPROBE_PATH;

function canStart(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-version"], { windowsHide: true, stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function firstBin(cands: readonly string[]): Promise<string | null> {
  for (const c of cands) {
    if (await canStart(c)) return c;
  }
  return null;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (b: Buffer) => { out += b.toString("utf8"); });
    child.stderr.on("data", (b: Buffer) => { err += b.toString("utf8"); });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) resolve(out || err);
      else reject(new Error(err.slice(-800) || out.slice(-800) || `${bin} exited ${code}`));
    });
  });
}

/** ffmpeg -i writes the format to stderr and exits 1. */
function ffmpegDashI(bin: string, file: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-hide_banner", "-i", file], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (b: Buffer) => { err += b.toString("utf8"); });
    child.on("error", () => resolve(err));
    child.on("close", () => resolve(err));
  });
}

let ffmpegBin: string | null = null;

beforeAll(async () => {
  ffmpegBin = await firstBin(["ffmpeg", FFMPEG_FALLBACK]);
  const ffprobe = await firstBin(["ffprobe", FFPROBE_FALLBACK]);
  if (ffmpegBin) process.env.E3_FFMPEG_PATH = ffmpegBin;
  if (ffprobe) process.env.E3_FFPROBE_PATH = ffprobe;
});

afterAll(() => {
  if (prevFfmpeg === undefined) delete process.env.E3_FFMPEG_PATH;
  else process.env.E3_FFMPEG_PATH = prevFfmpeg;
  if (prevFfprobe === undefined) delete process.env.E3_FFPROBE_PATH;
  else process.env.E3_FFPROBE_PATH = prevFfprobe;
});

afterEach(async () => {
  await rm(DIR, { recursive: true, force: true });
});

describe("YouTube MP4 render", () => {
  it("writes a 1920x1080 H.264 file with an audio stream", async (ctx) => {
    if (!ffmpegBin) ctx.skip();
    await mkdir(DIR, { recursive: true });
    const image = `${DIR}/cover.jpg`;
    const audio = `${DIR}/tone.wav`;
    const out = `${DIR}/out.mp4`;
    await run(ffmpegBin!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-ac", "2", audio]);
    await run(ffmpegBin!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x224466:s=64x64:d=1", "-frames:v", "1", image]);
    await renderYoutubeVideo({
      dir: DIR, image, audio, out, title: "BitRymDym", artist: null, timeoutMs: 120_000,
    });
    const size = (await stat(out)).size;
    expect(size).toBeGreaterThan(1000);
    let info = "";
    try {
      info = await run(resolveFfprobeBin(), ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", out]);
    } catch {
      info = await ffmpegDashI(ffmpegBin!, out);
    }
    expect(info).toMatch(/h264/);
    expect(info).toMatch(/audio/);
    expect(info).toMatch(/1920/);
    expect(info).toMatch(/1080/);
  }, 120_000);
});
