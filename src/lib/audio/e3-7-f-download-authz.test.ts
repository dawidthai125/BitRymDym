import { describe, expect, it } from "vitest";

import {
  FREE_AUDIO_CAPABILITIES,
  PREMIUM_AUDIO_CAPABILITIES,
  assertAudioCapability,
  hasAudioCapability,
  resolveEffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import {
  capabilityForRenderTier,
  isRenderJobTier,
} from "@/lib/audio/render-job-core";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

describe("E3.7-F — download AuthZ by quality_tier", () => {
  it("maps quality_tier → EXPORT_* capability", () => {
    expect(capabilityForRenderTier("BASIC_MP3")).toBe("EXPORT_BASIC_MP3");
    expect(capabilityForRenderTier("HQ_MP3")).toBe("EXPORT_HQ_MP3");
    expect(capabilityForRenderTier("WAV")).toBe("EXPORT_WAV");
    expect(isRenderJobTier("HQ_MP3")).toBe(true);
    expect(isRenderJobTier("evil")).toBe(false);
  });

  it("Free cannot assert HQ/WAV download capabilities", () => {
    const free = resolveEffectiveAudioEntitlement({
      userId: "u1",
      accountLevel: "BEGINNER_RAPPER",
      premium: null,
    });
    expect(hasAudioCapability(free, "EXPORT_BASIC_MP3")).toBe(true);
    expect(hasAudioCapability(free, "EXPORT_HQ_MP3")).toBe(false);
    expect(hasAudioCapability(free, "EXPORT_WAV")).toBe(false);
    expect(FREE_AUDIO_CAPABILITIES).not.toContain("EXPORT_HQ_MP3");
    expect(() =>
      assertAudioCapability(free, capabilityForRenderTier("HQ_MP3")),
    ).toThrow();
    expect(() =>
      assertAudioCapability(free, capabilityForRenderTier("WAV")),
    ).toThrow();
  });

  it("Premium can assert HQ/WAV download capabilities", () => {
    const premium = resolveEffectiveAudioEntitlement({
      userId: "u1",
      accountLevel: "BEGINNER_RAPPER",
      premium: {
        userId: "u1",
        active: true,
        source: "manual",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(PREMIUM_AUDIO_CAPABILITIES).toContain("EXPORT_HQ_MP3");
    expect(PREMIUM_AUDIO_CAPABILITIES).toContain("EXPORT_WAV");
    expect(() =>
      assertAudioCapability(premium, capabilityForRenderTier("HQ_MP3")),
    ).not.toThrow();
    expect(() =>
      assertAudioCapability(premium, capabilityForRenderTier("WAV")),
    ).not.toThrow();
  });

  it("still rejects client object_key / url on download surface", () => {
    expect(() =>
      rejectClientRenderSourceClaims({ object_key: "evil" }),
    ).toThrow(RenderJobDomainError);
  });
});
