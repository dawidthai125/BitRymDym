import { describe, expect, it } from "vitest";

import {
  evaluatePremiumDownloadGate,
  premiumQualityFromRenderTier,
} from "@/lib/premium/premium-download-authz";

describe("PREMIUM-04 download gate", () => {
  const base = {
    quality: "MP3_128" as const,
    hasUnlock: true,
    retentionExpiresAtMs: 2_000,
    nowMs: 1_000,
    workStatus: "WORK_READY" as const,
  };

  it("maps render tiers to premium qualities", () => {
    expect(premiumQualityFromRenderTier("BASIC_MP3")).toBe("MP3_128");
    expect(premiumQualityFromRenderTier("MP3_256")).toBe("MP3_256");
    expect(premiumQualityFromRenderTier("WAV")).toBe("WAV_COMPAT");
    expect(premiumQualityFromRenderTier("WAV_MASTER")).toBe("WAV_MASTER");
  });

  it("FREE deny even with unlock", () => {
    expect(
      evaluatePremiumDownloadGate({ ...base, premiumTier: "FREE" }),
    ).toEqual({ ok: false, reason: "FREE_NO_DOWNLOAD" });
  });

  it("quality live — Gold unlock then Bronze mint denies 320", () => {
    expect(
      evaluatePremiumDownloadGate({
        ...base,
        premiumTier: "BRONZE",
        quality: "MP3_320",
      }),
    ).toEqual({ ok: false, reason: "QUALITY_NOT_IN_PLAN" });
  });

  it("requires unlock and non-expired retention", () => {
    expect(
      evaluatePremiumDownloadGate({
        ...base,
        premiumTier: "BRONZE",
        hasUnlock: false,
      }),
    ).toEqual({ ok: false, reason: "NO_UNLOCK" });
    expect(
      evaluatePremiumDownloadGate({
        ...base,
        premiumTier: "BRONZE",
        retentionExpiresAtMs: 500,
      }),
    ).toEqual({ ok: false, reason: "RETENTION_EXPIRED" });
  });

  it("allows Bronze 128 when unlocked and within retention", () => {
    expect(
      evaluatePremiumDownloadGate({ ...base, premiumTier: "BRONZE" }),
    ).toEqual({ ok: true });
  });
});
