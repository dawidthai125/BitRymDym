import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GUEST_RECORDING_POLICY,
  minimumTierForQuality,
  PLAN_PAYMENTS_AVAILABLE,
  PLAN_POLICY,
  PLAN_TRIAL_DAYS,
  referenceMasteringForTier,
  yearlySavingPercent,
} from "@/config/plan-policy";
import { canDownloadFinishedPremiumFiles, PREMIUM_DOWNLOAD_BY_TIER, PREMIUM_RETENTION_DAYS } from "@/config/premium-export-policy";
import { PREMIUM_TIER_MATRIX } from "@/config/premium-tiers";
import { SAMPLE_POLICY_DEFAULTS } from "@/config/recording";
import { DELIVER_AUDIO_FORMATS_BY_TIER, DELIVER_FORMAT_QUALITY, DELIVER_WEEKLY_LIMIT, deliverOptions, minimumTierForDeliverFormat } from "@/lib/studio/deliver/policy";
import { PREMIUM_TIERS } from "@/types/premium";

const DAY = 86_400;

describe("plan policy SSOT (Owner 2026-10-29)", () => {
  it("prices: Bronze 14,99 / Silver 29,99 / Gold 49,99 zł a month, 119 / 239 / 399 zł a year, no trial, no checkout yet", () => {
    expect(PLAN_POLICY.FREE.price).toEqual({ monthlyPln: null, yearlyPln: null });
    expect(PLAN_POLICY.BRONZE.price).toEqual({ monthlyPln: 14.99, yearlyPln: 119 });
    expect(PLAN_POLICY.SILVER.price).toEqual({ monthlyPln: 29.99, yearlyPln: 239 });
    expect(PLAN_POLICY.GOLD.price).toEqual({ monthlyPln: 49.99, yearlyPln: 399 });
    expect(PLAN_TRIAL_DAYS).toBe(0);
    expect(PLAN_PAYMENTS_AVAILABLE).toBe(false);
    expect(yearlySavingPercent(PLAN_POLICY.BRONZE.price)).toBe(33);
    expect(yearlySavingPercent(PLAN_POLICY.GOLD.price)).toBe(33);
    expect(yearlySavingPercent(PLAN_POLICY.FREE.price)).toBeNull();
  });

  it("take length unchanged: 15 / 30 / 60 / 120 / 180 s (guest / Free / Bronze / Silver / Gold)", () => {
    expect(GUEST_RECORDING_POLICY.maxTakeSeconds).toBe(15);
    expect(PREMIUM_TIERS.map((t) => PLAN_POLICY[t].recording.maxTakeSeconds)).toEqual([30, 60, 120, 180]);
    expect(PREMIUM_TIERS.map((t) => SAMPLE_POLICY_DEFAULTS[t].maxRecordingSeconds)).toEqual([30, 60, 120, 180]);
    expect(SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxRecordingSeconds).toBe(15);
  });

  it("Free: 1 recording a day, valid 24 h, 3 tracks, 3 projects, no downloads", () => {
    expect(SAMPLE_POLICY_DEFAULTS.FREE.maxSessionsPerUtcDay).toBe(1);
    expect(SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds).toBe(DAY);
    expect(PREMIUM_TIER_MATRIX.FREE.studioMaxTracks).toBe(3);
    expect(PLAN_POLICY.FREE.studio.maxProjects).toBe(3);
    expect(PREMIUM_DOWNLOAD_BY_TIER.FREE).toEqual([]);
    expect(canDownloadFinishedPremiumFiles("FREE")).toBe(false);
    expect(DELIVER_AUDIO_FORMATS_BY_TIER.FREE).toEqual([]);
    expect(deliverOptions("FREE").every((o) => !o.enabled)).toBe(true);
  });

  it("no plan has a weekly file cap any more", () => {
    expect(Object.values(DELIVER_WEEKLY_LIMIT).every((v) => v === null)).toBe(true);
  });

  it("projects 3 / 10 / 25 / 50, masters a month 8 / 30 / 80 / 200", () => {
    expect(PREMIUM_TIERS.map((t) => PLAN_POLICY[t].studio.maxProjects)).toEqual([3, 10, 25, 50]);
    expect(PREMIUM_TIERS.map((t) => PLAN_POLICY[t].mastering.mastersPerMonth)).toEqual([8, 30, 80, 200]);
  });

  it("every limit grows (or stays) with the plan — Gold keeps files the longest", () => {
    const keys = [
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].recording.maxTakeSeconds,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].recording.sessionsPerDay,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].recording.takeTtlSeconds,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].studio.maxProjects,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].studio.maxTracks,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].mastering.mastersPerMonth,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].downloads.qualities.length,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].retentionDays,
    ];
    for (const k of keys) {
      const v = PREMIUM_TIERS.map(k);
      for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    }
    expect(PLAN_POLICY.GOLD.retentionDays).toBeGreaterThan(PLAN_POLICY.SILVER.retentionDays);
    expect(PREMIUM_TIER_MATRIX.GOLD.artifactRetentionSeconds).toBeGreaterThan(PREMIUM_TIER_MATRIX.SILVER.artifactRetentionSeconds);
    expect(PREMIUM_RETENTION_DAYS.GOLD).toBeGreaterThan(PREMIUM_RETENTION_DAYS.SILVER);
    // One retention number per plan: Premium unlocks and render artifacts agree.
    for (const t of PREMIUM_TIERS) expect(PREMIUM_TIER_MATRIX[t].artifactRetentionSeconds).toBe(PREMIUM_RETENTION_DAYS[t] * DAY);
  });

  it("reference mastering: Gold included, Silver paid add-on, others none (flag only)", () => {
    expect(PREMIUM_TIERS.map(referenceMasteringForTier)).toEqual(["none", "none", "addon", "included"]);
  });

  it("recording tools (calibration, loop, takes, comping) are for every signed-in plan, not for guests", () => {
    expect(PREMIUM_TIERS.every((t) => PLAN_POLICY[t].recording.studioRecordingTools)).toBe(true);
    expect(GUEST_RECORDING_POLICY.studioRecordingTools).toBe(false);
  });
});

describe("one export policy (Premium downloads = Studio deliverables)", () => {
  it("Studio formats are exactly the plan qualities they map to", () => {
    for (const tier of PREMIUM_TIERS) {
      for (const [format, quality] of Object.entries(DELIVER_FORMAT_QUALITY)) {
        expect(DELIVER_AUDIO_FORMATS_BY_TIER[tier].includes(format as never)).toBe(PREMIUM_DOWNLOAD_BY_TIER[tier].includes(quality));
      }
    }
  });
  it("lock labels name the lowest plan that unlocks a format", () => {
    expect(minimumTierForDeliverFormat("MP3_128")).toBe("BRONZE");
    expect(minimumTierForDeliverFormat("MP3_192")).toBe("SILVER");
    expect(minimumTierForDeliverFormat("MP3_320")).toBe("GOLD");
    expect(minimumTierForDeliverFormat("WAV_24")).toBe("GOLD");
    expect(minimumTierForDeliverFormat("ZIP")).toBe("GOLD");
    expect(minimumTierForQuality("MP3_256")).toBe("SILVER");
  });
  it("Studio deliver policy has no hard-coded tier ladder of its own", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/studio/deliver/policy.ts"), "utf8");
    expect(src).not.toMatch(/FREE:\s*\["MP3_128"\]/);
    expect(src).toContain("PLAN_POLICY");
  });
});
