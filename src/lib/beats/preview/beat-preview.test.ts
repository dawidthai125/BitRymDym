import { describe, expect, it } from "vitest";

import { validateObjectKey } from "@/lib/beats/audio-validation";
import {
  BEAT_PREVIEW_SECONDS,
  buildPreviewFfmpegArgs,
  buildPreviewObjectKey,
  isPreviewFresh,
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
});
