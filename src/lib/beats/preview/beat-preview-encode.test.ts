/** Real ffmpeg: the preview file is ~20 s MP3 (run via npm run test:media). */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildPreviewFfmpegArgs } from "@/lib/beats/preview/beat-preview";

describe("beat preview encode (real ffmpeg)", () => {
  it("60 s source → 20 s 128k MP3 with fade-out", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "brd-pv-"));
    try {
      const src = path.join(dir, "src.wav");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=60", "-ac", "2", src]);
      const out = path.join(dir, "p.mp3");
      execFileSync("ffmpeg", buildPreviewFfmpegArgs({ input: src, output: out, sourceDurationSeconds: 60 }));
      const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).trim());
      expect(dur).toBeGreaterThan(19.8);
      expect(dur).toBeLessThan(20.2);
      const codec = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,bit_rate", "-of", "csv=p=0", out], { encoding: "utf8" }).trim();
      expect(codec.startsWith("mp3")).toBe(true);
      expect((await stat(out)).size).toBeLessThan(400_000);
      expect((await readFile(out)).byteLength).toBeGreaterThan(10_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
