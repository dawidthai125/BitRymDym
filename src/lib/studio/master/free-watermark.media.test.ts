/** Real FFmpeg: the Free watermark encode (test signal only, no production audio). Runs via `npm run test:media`. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { previewMixArgs, tagCycleArgs, PREVIEW_TAG_FIRST_MS } from "./preview";
import { PREVIEW_TAG_WAV_BASE64 } from "./preview-tag";
import { DELIVER_FFMPEG_ARGS } from "@/lib/studio/deliver/policy";

const dir = mkdtempSync(path.join(tmpdir(), "wm-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const ff = (args: string[]) => execFileSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
const duration = (f: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
/** RMS level (dB) of a window, from astats (ffmpeg prints it on stderr). */
function rmsDb(file: string, startS: number, lenS: number): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(startS), "-t", String(lenS), "-i", file, "-af", "astats", "-f", "null", "-"], { encoding: "utf8" });
  const m = /RMS level dB:\s*(-?[\d.]+)/.exec(r.stderr ?? "");
  if (!m) throw new Error("no RMS level in astats output");
  return Number(m[1]);
}

describe("Free watermark encode (real ffmpeg, test signal)", () => {
  it("keeps the length, stays MP3 128 and audibly adds the tag at the first tag time", () => {
    const src = path.join(dir, "src.wav");
    ff(["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=24", "-af", "volume=0.1", "-ar", "48000", "-ac", "2", src]);
    const tag = path.join(dir, "tag.wav");
    const cycle = path.join(dir, "cycle.wav");
    writeFileSync(tag, Buffer.from(PREVIEW_TAG_WAV_BASE64, "base64"));
    ff(tagCycleArgs(tag, cycle));
    const clean = path.join(dir, "clean.mp3");
    const marked = path.join(dir, "marked.mp3");
    ff(["-y", "-i", src, ...DELIVER_FFMPEG_ARGS.MP3_128, "-ar", "48000", clean]);
    ff(previewMixArgs(src, cycle, marked));
    expect(statSync(marked).size).toBeGreaterThan(10_000);
    expect(Math.abs(duration(marked) - duration(clean))).toBeLessThan(0.3);
    const first = PREVIEW_TAG_FIRST_MS / 1000;
    const cleanLvl = rmsDb(clean, first, 1);
    const markedLvl = rmsDb(marked, first, 1);
    expect(markedLvl - cleanLvl).toBeGreaterThan(1);
  });
});
