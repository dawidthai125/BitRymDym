import { describe, expect, it } from "vitest";

import {
  PREMIUM_DOWNLOAD_BY_TIER,
  PREMIUM_UNLOCK_CREDITS_PER_PERIOD,
  PREMIUM_RETENTION_DAYS,
  PREMIUM_WAV_PROFILES,
  buildPremiumDownloadLadder,
  canDownloadFinishedPremiumFiles,
  canDownloadPremiumQuality,
  creditPeriodBounds,
} from "@/config/premium-export-policy";
import { SFM_PLAN_MATRIX } from "@/lib/sfm/sfm-plan-matrix";

describe("PREMIUM-01 export policy SSOT", () => {
  it("credits 0/1/2/4 and retention 7/7/14/28", () => {
    expect(PREMIUM_UNLOCK_CREDITS_PER_PERIOD).toEqual({
      FREE: 0,
      BRONZE: 1,
      SILVER: 2,
      GOLD: 4,
    });
    expect(PREMIUM_RETENTION_DAYS).toEqual({
      FREE: 7,
      BRONZE: 7,
      SILVER: 14,
      GOLD: 28,
    });
  });

  it("FREE cannot download finished files; BRONZE only 128", () => {
    expect(canDownloadFinishedPremiumFiles("FREE")).toBe(false);
    expect(PREMIUM_DOWNLOAD_BY_TIER.FREE).toEqual([]);
    expect(canDownloadPremiumQuality({ premiumTier: "FREE", quality: "MP3_128" })).toBe(
      false,
    );
    expect(
      canDownloadPremiumQuality({ premiumTier: "BRONZE", quality: "MP3_128" }),
    ).toBe(true);
    expect(
      canDownloadPremiumQuality({ premiumTier: "BRONZE", quality: "MP3_192" }),
    ).toBe(false);
  });

  it("SILVER has 128/192/256 not 320; GOLD has 320 + 3 WAV", () => {
    expect(PREMIUM_DOWNLOAD_BY_TIER.SILVER).toEqual([
      "MP3_128",
      "MP3_192",
      "MP3_256",
    ]);
    expect(
      canDownloadPremiumQuality({ premiumTier: "SILVER", quality: "MP3_320" }),
    ).toBe(false);
    expect(PREMIUM_DOWNLOAD_BY_TIER.GOLD).toContain("MP3_320");
    expect(PREMIUM_DOWNLOAD_BY_TIER.GOLD).toEqual(
      expect.arrayContaining(["WAV_COMPAT", "WAV_PRO", "WAV_MASTER"]),
    );
  });

  it("WAV profiles match D-1", () => {
    expect(PREMIUM_WAV_PROFILES.WAV_COMPAT).toMatchObject({
      sampleRate: 44100,
      bitDepth: 16,
    });
    expect(PREMIUM_WAV_PROFILES.WAV_PRO).toMatchObject({
      sampleRate: 44100,
      bitDepth: 24,
    });
    expect(PREMIUM_WAV_PROFILES.WAV_MASTER).toMatchObject({
      sampleRate: 48000,
      bitDepth: 24,
    });
  });

  it("credit period is 7d from activation not calendar week", () => {
    const activated = Date.parse("2026-10-01T10:00:00.000Z");
    const mid = activated + 3 * 24 * 60 * 60 * 1000;
    const b0 = creditPeriodBounds({ activatedAtMs: activated, nowMs: mid });
    expect(b0.periodIndex).toBe(0);
    expect(b0.periodEndMs - b0.periodStartMs).toBe(7 * 24 * 60 * 60 * 1000);

    const next = activated + 7 * 24 * 60 * 60 * 1000 + 1000;
    const b1 = creditPeriodBounds({ activatedAtMs: activated, nowMs: next });
    expect(b1.periodIndex).toBe(1);
  });

  it("ladder always shows all qualities; FREE all locked", () => {
    const ladder = buildPremiumDownloadLadder("FREE");
    expect(ladder).toHaveLength(7);
    expect(ladder.every((r) => r.unlocked === false)).toBe(true);
  });

  it("does not merge with SFM_PLAN_MATRIX (D-4)", () => {
    expect(SFM_PLAN_MATRIX.SILVER.qualities).toEqual(["MP3_128", "MP3_192"]);
    expect(PREMIUM_DOWNLOAD_BY_TIER.SILVER).toContain("MP3_256");
    expect(SFM_PLAN_MATRIX.GOLD.firstDownloadsPerDay).toBe(5);
    expect(PREMIUM_UNLOCK_CREDITS_PER_PERIOD.GOLD).toBe(4);
  });
});
