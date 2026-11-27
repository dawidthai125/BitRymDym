import { describe, expect, it } from "vitest";

import { validateObjectKey } from "@/lib/beats/audio-validation";
import {
  BEAT_PREVIEW_SECONDS,
  beatTagTiming,
  buildPreviewFfmpegArgs,
  buildPreviewObjectKey,
  isGuestShortPreviewFilename,
  isPaidWatermarkPreviewFilename,
  isPreviewFresh,
  paidWatermarkPreviewSourceMarker,
  previewSourceMarker,
} from "@/lib/beats/preview/beat-preview";

const B = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const O = "33333333-3333-4333-8333-333333333333";

describe("beat preview helpers", () => {
  it("preview length follows the guest policy (20 s)", () => {
    expect(BEAT_PREVIEW_SECONDS).toBe(20);
  });

  it("ffmpeg args: 20 s, fade-out at the end, 128k MP3, no metadata", () => {
    const a = buildPreviewFfmpegArgs({ input: "in.bin", output: "out.mp3" });
    expect(a.slice(a.indexOf("-t"), a.indexOf("-t") + 2)).toEqual(["-t", "20"]);
    expect(a).toContain("afade=t=out:st=18.500:d=1.500");
    expect(a).toEqual(expect.arrayContaining(["libmp3lame", "128k", "-map_metadata", "-1"]));
    expect(a.at(-1)).toBe("out.mp3");
  });

  it("short source: preview is the whole beat with the fade at its end", () => {
    const a = buildPreviewFfmpegArgs({ input: "i", output: "o", sourceDurationSeconds: 12 });
    expect(a.slice(a.indexOf("-t"), a.indexOf("-t") + 2)).toEqual(["-t", "12"]);
    expect(a).toContain("afade=t=out:st=10.500:d=1.500");
  });

  it("object keys use the canonical private layout and pass validation", () => {
    const p = buildPreviewObjectKey({ ownershipType: "PLATFORM", ownerId: null, beatId: B, assetId: A });
    expect(p).toBe(`platform/${B}/${A}/preview.bin`);
    expect(validateObjectKey(p)).toBeNull();
    const u = buildPreviewObjectKey({ ownershipType: "USER", ownerId: O, beatId: B, assetId: A });
    expect(u).toBe(`user/${O}/${B}/${A}/preview.bin`);
    expect(validateObjectKey(u)).toBeNull();
    expect(() => buildPreviewObjectKey({ ownershipType: "USER", ownerId: null, beatId: B, assetId: A })).toThrow();
  });

  it("fresh only when cut from the current active master", () => {
    const ok = { original_filename: previewSourceMarker("m2"), status: "READY", is_active: true };
    expect(isPreviewFresh({ preview: ok, masterAssetId: "m2" })).toBe(true);
    expect(isPreviewFresh({ preview: ok, masterAssetId: "m3" })).toBe(false);
    expect(isPreviewFresh({ preview: { ...ok, status: "FAILED" }, masterAssetId: "m2" })).toBe(false);
    expect(isPreviewFresh({ preview: null, masterAssetId: "m2" })).toBe(false);
  });

  it("paid watermark marker is distinct from the short guest cut", () => {
    const mid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const wm = paidWatermarkPreviewSourceMarker(mid);
    expect(wm).toBe(`preview-wm-full-of-bar3-${mid}.mp3`);
    // A preview with the old 15 s tag still plays, but the backfill renders it again.
    expect(isPaidWatermarkPreviewFilename(`preview-wm-full-of-${mid}.mp3`)).toBe(true);
    expect(isPaidWatermarkPreviewFilename(wm)).toBe(true);
    expect(isGuestShortPreviewFilename(wm)).toBe(false);
    expect(isGuestShortPreviewFilename(previewSourceMarker(mid))).toBe(true);
    expect(
      isPreviewFresh({
        preview: { original_filename: wm, status: "READY", is_active: true },
        masterAssetId: mid,
        kind: "paidWm",
      }),
    ).toBe(true);
    expect(
      isPreviewFresh({
        preview: {
          original_filename: previewSourceMarker(mid),
          status: "READY",
          is_active: true,
        },
        masterAssetId: mid,
        kind: "paidWm",
      }),
    ).toBe(false);
  });
});

describe("voice tag in every 3rd bar", () => {
  it("starts bar 3 and repeats every three bars of the beat's own tempo", () => {
    for (const bpm of [75, 90, 140, 160]) {
      const bar = 240 / bpm;
      const timing = beatTagTiming(bpm);
      expect(timing.firstMs).toBe(Math.round(bar * 2000));
      expect(timing.everySeconds).toBeCloseTo(bar * 3, 5);
      // The 0.83 s tag fits inside one repeat.
      expect(timing.firstMs / 1000 + 0.83).toBeLessThan(timing.everySeconds);
    }
  });

  it("falls back to 120 BPM without a usable tempo", () => {
    for (const bpm of [null, undefined, 0, 500]) expect(beatTagTiming(bpm)).toEqual({ firstMs: 4000, everySeconds: 6 });
  });
});
