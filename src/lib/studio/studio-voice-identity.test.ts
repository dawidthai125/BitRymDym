import { describe, expect, it } from "vitest";
import { shouldReuseStudioVoice } from "@/lib/studio/studio-voice-identity";

describe("shouldReuseStudioVoice (stage 0 fade/graph regression)", () => {
  it("reuses a versioned voice only for the same identity", () => {
    expect(shouldReuseStudioVoice({ existingIdentityKey: "beat:b|a1", nextIdentityKey: "beat:b|a1" })).toBe(true);
    expect(shouldReuseStudioVoice({ existingIdentityKey: "beat:b|a1", nextIdentityKey: "beat:b|a2" })).toBe(false);
  });

  it("reuses an unversioned voice when the resolved URL is unchanged (no new clip gain → no silence on seek)", () => {
    expect(
      shouldReuseStudioVoice({
        existingIdentityKey: null,
        nextIdentityKey: null,
        existingSourceUrl: "https://x.test/b.bin",
        nextSourceUrl: "https://x.test/b.bin",
      }),
    ).toBe(true);
  });

  it("does not reuse an unversioned voice for a different URL or a previously versioned voice", () => {
    expect(
      shouldReuseStudioVoice({ existingIdentityKey: null, nextIdentityKey: null, existingSourceUrl: "a", nextSourceUrl: "b" }),
    ).toBe(false);
    expect(
      shouldReuseStudioVoice({ existingIdentityKey: "beat:b|a1", nextIdentityKey: null, existingSourceUrl: "a", nextSourceUrl: "a" }),
    ).toBe(false);
    expect(shouldReuseStudioVoice({ existingIdentityKey: null, nextIdentityKey: null })).toBe(false);
  });
});
