import { describe, expect, it } from "vitest";

import { suggestTitleFromFilename } from "@/lib/beats/filename-title";

describe("suggestTitleFromFilename", () => {
  it("strips .wav extension", () => {
    expect(suggestTitleFromFilename("phase19-master-tone.wav")).toBe(
      "phase19-master-tone",
    );
  });

  it("strips .mp3 extension", () => {
    expect(suggestTitleFromFilename("night-drill.mp3")).toBe("night-drill");
  });

  it("strips .flac extension", () => {
    expect(suggestTitleFromFilename("cold-loop.flac")).toBe("cold-loop");
  });

  it("handles spaces in filename", () => {
    expect(suggestTitleFromFilename("My Beat Final.wav")).toBe("My Beat Final");
  });

  it("keeps multi-dot basename without final extension", () => {
    expect(suggestTitleFromFilename("archive.tar.wav")).toBe("archive.tar");
  });

  it("returns basename when no extension", () => {
    expect(suggestTitleFromFilename("phase19-master-tone")).toBe(
      "phase19-master-tone",
    );
  });

  it("returns empty for empty or invalid filename", () => {
    expect(suggestTitleFromFilename("")).toBe("");
    expect(suggestTitleFromFilename("   ")).toBe("");
    expect(suggestTitleFromFilename(null)).toBe("");
    expect(suggestTitleFromFilename(undefined)).toBe("");
  });

  it("normalizes underscores to spaces", () => {
    expect(suggestTitleFromFilename("dark_trap_loop.wav")).toBe(
      "dark trap loop",
    );
  });
});
