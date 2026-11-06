import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { masterPlaybackChoice, masterPreviewEnforced, PREVIEW_BITRATE, PREVIEW_TAG_EVERY_S, PREVIEW_TAG_FIRST_MS, previewKeyFor, previewMixArgs, tagCycleArgs } from "./preview";
import { PREVIEW_TAG_WAV_BASE64 } from "./preview-tag";

describe("master preview — keys", () => {
  it("maps the master result key to the preview key, nothing else", () => {
    expect(previewKeyFor("studio-master/u/p/j/out/master.flac")).toBe("studio-master/u/p/j/out/master_preview.mp3");
    expect(previewKeyFor("studio-master/u/p/j/out/transcode.mp3")).toBeNull();
    expect(previewKeyFor("studio-master/u/p/j/out/master.flac.part1")).toBeNull();
  });
});

describe("master preview — playback choice", () => {
  it("with enforcement the clean file is never played before approval", () => {
    expect(masterPlaybackChoice({ previewExists: true, approved: false, enforce: true })).toBe("preview");
    expect(masterPlaybackChoice({ previewExists: true, approved: true, enforce: true })).toBe("preview");
    expect(masterPlaybackChoice({ previewExists: false, approved: true, enforce: true })).toBe("clean");
    expect(masterPlaybackChoice({ previewExists: false, approved: false, enforce: true })).toBe("none");
  });
  it("without enforcement (default) nothing breaks while the worker is updated", () => {
    expect(masterPlaybackChoice({ previewExists: false, approved: false })).toBe("clean");
    expect(masterPlaybackChoice({ previewExists: true, approved: false })).toBe("preview");
  });
  it("enforcement is an explicit env switch, off by default", () => {
    expect(masterPreviewEnforced({})).toBe(false);
    expect(masterPreviewEnforced({ STUDIO_MASTER_PREVIEW_ENFORCE: "0" })).toBe(false);
    expect(masterPreviewEnforced({ STUDIO_MASTER_PREVIEW_ENFORCE: " 1 " })).toBe(true);
    expect(masterPreviewEnforced({ STUDIO_MASTER_PREVIEW_ENFORCE: "TRUE" })).toBe(true);
  });
});

describe("master preview — ffmpeg", () => {
  it("delays the first tag and pads to the repeat interval", () => {
    const args = tagCycleArgs("tag.wav", "cycle.wav");
    expect(args.join(" ")).toContain(`adelay=${PREVIEW_TAG_FIRST_MS},apad=whole_dur=${PREVIEW_TAG_EVERY_S}`);
    expect(PREVIEW_TAG_FIRST_MS / 1000).toBeLessThan(PREVIEW_TAG_EVERY_S);
  });
  it("loops the tag under the master, keeps the master length and encodes a low-bitrate MP3", () => {
    const joined = previewMixArgs("master.flac", "cycle.wav", "out.mp3").join(" ");
    expect(joined).toContain("-stream_loop -1 -i cycle.wav");
    expect(joined).toContain("duration=first");
    expect(joined).toContain("alimiter");
    expect(joined).toContain(`-c:a libmp3lame -b:a ${PREVIEW_BITRATE}`);
    expect(PREVIEW_BITRATE).toBe("128k");
  });
});

describe("master preview — tag asset", () => {
  it("is a short mono WAV", () => {
    const b = Buffer.from(PREVIEW_TAG_WAV_BASE64, "base64");
    expect(b.subarray(0, 4).toString()).toBe("RIFF");
    expect(b.subarray(8, 12).toString()).toBe("WAVE");
    expect(b.readUInt16LE(22)).toBe(1);
    const seconds = (b.length - 44) / (b.readUInt32LE(24) * 2);
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(2);
  });
});

describe("master preview — wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("worker builds the preview for master jobs only and never fails the job on it", () => {
    const src = read("src/lib/studio/master/worker.ts");
    expect(src).toContain('if (job.kind === "master")');
    expect(src).toContain("preview is optional");
  });
  it("job API hands the studio the preview, not the clean master", () => {
    const src = read("src/lib/studio/master/server.ts");
    expect(src).toContain("masterPlaybackChoice");
    expect(src).toContain('choice === "none"');
  });
});
