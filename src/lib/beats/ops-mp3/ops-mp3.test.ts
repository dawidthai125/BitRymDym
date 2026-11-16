import { describe, expect, it } from "vitest";

import {
  buildOpsMp3FfmpegArgs,
  isOpsMp3Fresh,
  opsMp3SourceMarker,
  tagsWithOpsMp3Wanted,
  tagsWithoutOpsMp3Wanted,
  OPS_MP3_WANTED_TAG,
} from "@/lib/beats/ops-mp3/ops-mp3";

describe("ops-mp3 helpers", () => {
  it("marks provenance and freshness against the master id", () => {
    const mid = "11111111-1111-4111-8111-111111111111";
    expect(opsMp3SourceMarker(mid)).toBe(`ops-mp3-of-${mid}.mp3`);
    expect(
      isOpsMp3Fresh({
        asset: {
          original_filename: opsMp3SourceMarker(mid),
          status: "READY",
          is_active: true,
        },
        masterAssetId: mid,
      }),
    ).toBe(true);
    expect(
      isOpsMp3Fresh({
        asset: {
          original_filename: opsMp3SourceMarker(mid),
          status: "READY",
          is_active: true,
        },
        masterAssetId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(false);
  });

  it("builds a full-file lame encode without a time cut", () => {
    const args = buildOpsMp3FfmpegArgs({ input: "in.bin", output: "out.mp3" });
    expect(args).toEqual(
      expect.arrayContaining(["libmp3lame", "192k", "-map_metadata", "-1", "in.bin", "out.mp3"]),
    );
    expect(args).not.toContain("-t");
  });

  it("toggles the Contabo queue tag", () => {
    expect(tagsWithOpsMp3Wanted(["z-generatora"])).toEqual([
      "z-generatora",
      OPS_MP3_WANTED_TAG,
    ]);
    expect(tagsWithOpsMp3Wanted(["z-generatora", OPS_MP3_WANTED_TAG])).toEqual([
      "z-generatora",
      OPS_MP3_WANTED_TAG,
    ]);
    expect(tagsWithoutOpsMp3Wanted(["z-generatora", OPS_MP3_WANTED_TAG])).toEqual([
      "z-generatora",
    ]);
  });
});
