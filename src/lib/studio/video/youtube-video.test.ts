import { describe, expect, it } from "vitest";

import { PLAN_POLICY, youtubeVideoForTier } from "@/config/plan-policy";

import {
  cleanVideoText, decideYoutubeVideo, ffmpegProgressFraction, isYoutubeVideoSpec, youtubeEncodeArgs, youtubeFrameArgs,
  youtubeFrameLayout, youtubeImageKey, youtubeVideoAllowed, YT_VIDEO_H,
} from "./youtube-video";

const U = "11111111-1111-4111-8111-111111111111";

describe("YouTube MP4 — plan gate", () => {
  it("only Gold has it", () => {
    expect(["FREE", "BRONZE", "SILVER", "GOLD"].map((t) => PLAN_POLICY[t as "GOLD"].downloads.youtubeVideo)).toEqual([false, false, false, true]);
    expect(youtubeVideoForTier("GOLD")).toBe(true);
    expect(youtubeVideoAllowed(null)).toBe(false);
  });
  it("plan is checked before anything else (lower plans always get the upsell)", () => {
    expect(decideYoutubeVideo({ tier: "SILVER", approved: false, source: "x", hasImage: false })).toEqual({ allowed: false, reason: "tier_video" });
    expect(decideYoutubeVideo({ tier: "GOLD", approved: true, source: "x", hasImage: true })).toEqual({ allowed: false, reason: "bad_request" });
    expect(decideYoutubeVideo({ tier: "GOLD", approved: false, source: "cover", hasImage: true })).toEqual({ allowed: false, reason: "not_approved" });
    expect(decideYoutubeVideo({ tier: "GOLD", approved: true, source: "upload", hasImage: false })).toEqual({ allowed: false, reason: "image_missing" });
    expect(decideYoutubeVideo({ tier: "GOLD", approved: true, source: "cover", hasImage: true })).toEqual({ allowed: true });
  });
});

describe("text + spec", () => {
  it("cleans control / bidi chars, collapses spaces, caps at 80", () => {
    expect(cleanVideoText("  Nocny\n\tPrzejazd\u202e  ")).toBe("Nocny Przejazd");
    expect(cleanVideoText("   ")).toBeNull();
    expect(cleanVideoText(5)).toBeNull();
    expect(Array.from(cleanVideoText("ż".repeat(200))!).length).toBe(80);
  });
  it("validates the job spec", () => {
    const ok = { source: "cover", image: { bucket: "beat-covers", key: "u/b/full.webp" }, title: "A", artist: null };
    expect(isYoutubeVideoSpec(ok)).toBe(true);
    expect(isYoutubeVideoSpec({ ...ok, image: { bucket: "other", key: "a" } })).toBe(false);
    expect(isYoutubeVideoSpec({ ...ok, image: { bucket: "beat-covers", key: "../x" } })).toBe(false);
    expect(isYoutubeVideoSpec({ ...ok, image: { bucket: "beat-covers", key: "a b" } })).toBe(false);
  });
  it("own image key is under owner + project, ids checked", () => {
    expect(youtubeImageKey(U, U, U)).toBe(`studio-video/${U}/${U}/img/${U}.jpg`);
    expect(() => youtubeImageKey("x", U, U)).toThrow();
  });
});

describe("frame layout + ffmpeg args", () => {
  it("16:9 without text fills the frame, anything else is fitted", () => {
    expect(youtubeFrameLayout({ w: 1920, h: 1080 }, { title: null, artist: null })).toEqual({ mode: "full" });
    expect(youtubeFrameLayout({ w: 1024, h: 1024 }, { title: null, artist: null })).toMatchObject({ mode: "fit", box: { w: 1760, h: 960 } });
    expect(youtubeFrameLayout({ w: 1920, h: 1080 }, { title: "T", artist: null }).mode).toBe("fit");
  });
  it("text goes under the image and stays inside the frame", () => {
    const l = youtubeFrameLayout({ w: 1000, h: 1000 }, { title: "x".repeat(80), artist: "Dawid" });
    if (l.mode !== "fit") throw new Error("fit expected");
    expect(l.title!.y).toBeGreaterThanOrEqual(l.y + l.box.h);
    expect(l.artist!.y + l.artist!.size).toBeLessThanOrEqual(YT_VIDEO_H);
    expect(l.title!.size).toBeGreaterThanOrEqual(34);
  });
  it("frame graph: blurred fill + fitted image + text from files only", () => {
    const layout = youtubeFrameLayout({ w: 1000, h: 1000 }, { title: "T", artist: "A" });
    const args = youtubeFrameArgs({ image: "/tmp/j/image.jpg", out: "/tmp/j/frame.png", layout, fontFile: "/f/DejaVuSans-Bold.ttf", titleFile: "/tmp/j/title.txt", artistFile: "/tmp/j/artist.txt" });
    const g = args[args.indexOf("-filter_complex") + 1];
    expect(g).toContain("gblur");
    expect(g).toContain("textfile=/tmp/j/title.txt:expansion=none");
    expect(g).not.toContain("text='");
    expect(args).toContain("-frames:v");
    expect(() => youtubeFrameArgs({ image: "/tmp/a;b", out: "/tmp/o.png", layout, fontFile: "/f.ttf" })).toThrow("unsafe_path");
  });
  it("encode: 1080p H.264 yuv420p + AAC, exact audio length, faststart", () => {
    const a = youtubeEncodeArgs({ frame: "/t/f.png", audio: "/t/m.flac", out: "/t/o.mp4", durationS: 150.5 });
    expect(a.join(" ")).toContain("-c:v libx264");
    expect(a.join(" ")).toContain("-pix_fmt yuv420p");
    expect(a.join(" ")).toContain("-c:a aac");
    expect(a[a.indexOf("-t") + 1]).toBe("150.500");
    expect(a).toContain("+faststart");
    expect(() => youtubeEncodeArgs({ frame: "/t/f.png", audio: "/t/m.flac", out: "/t/o.mp4", durationS: 0 })).toThrow();
  });
  it("progress parse", () => {
    expect(ffmpegProgressFraction("frame=1\nout_time_us=75250000\nprogress=continue\n", 150.5)).toBeCloseTo(0.5);
    expect(ffmpegProgressFraction("bitrate=1\n", 10)).toBeNull();
    expect(ffmpegProgressFraction("out_time_us=99000000", 10)).toBe(1);
  });
});
