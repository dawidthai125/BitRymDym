/** Real ffmpeg: a 3-min synthetic song → 45 s 128 kbps MP3 clip with fades (run via npm run test:media). */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { workClipFfmpegArgs, workClipWindow } from "@/lib/catalog/work-clip";

const probe = (file: string, entries: string, stream = false) =>
  execFileSync("ffprobe", ["-v", "error", ...(stream ? ["-select_streams", "a:0"] : []), "-show_entries", entries, "-of", "csv=p=0", file], { encoding: "utf8" }).trim();

describe("work clip encode (real ffmpeg)", () => {
  it("180 s FLAC master → 45 s stereo 44.1 kHz MP3 cut from 30 s, silent at both ends", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "brd-wc-"));
    try {
      const src = path.join(dir, "master.flac");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=330:d=180", "-ac", "2", "-ar", "48000", "-sample_fmt", "s32", src]);
      const window = workClipWindow(180);
      expect(window).toEqual({ start: 30, length: 45 });
      const out = path.join(dir, "clip.mp3");
      execFileSync("ffmpeg", workClipFfmpegArgs({ input: src, output: out, ...window! }));
      const dur = Number(probe(out, "format=duration"));
      expect(dur).toBeGreaterThan(44.8);
      expect(dur).toBeLessThan(45.3);
      expect(probe(out, "stream=codec_name,channels,sample_rate", true)).toBe("mp3,44100,2");
      // ~128 kbps × 45 s ≈ 720 kB
      expect((await stat(out)).size).toBeGreaterThan(600_000);
      expect((await stat(out)).size).toBeLessThan(800_000);
      // Fade in/out: the first and last 50 ms are much quieter than the middle.
      const vol = (ss: number) => {
        const r = spawnSync("ffmpeg", ["-v", "info", "-ss", String(ss), "-t", "0.05", "-i", out, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
        return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? "0");
      };
      expect(vol(0.02)).toBeLessThan(vol(20) - 15);
      expect(vol(44.9)).toBeLessThan(vol(20) - 15);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
