import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  beatDownloadsPerDayForTier,
  bitekMemoryForTier,
  minimumTierFor,
  vocalPresetAccessForTier,
  GUEST_POLICY,
  LISTEN_LINK_DB_MAX_DAYS,
  maxRecordingTracksForTier,
  minimumTierForQuality,
  PLAN_PAYMENTS_AVAILABLE,
  readPlanPaymentsAvailable,
  PLAN_POLICY,
  PLAN_TRIAL_DAYS,
  referenceMasteringForTier,
  yearlySavingPercent,
} from "@/config/plan-policy";
import { canDownloadFinishedPremiumFiles, PREMIUM_DOWNLOAD_BY_TIER, PREMIUM_RETENTION_DAYS } from "@/config/premium-export-policy";
import { PREMIUM_TIER_MATRIX } from "@/config/premium-tiers";
import { SAMPLE_POLICY_DEFAULTS } from "@/config/recording";
import { DELIVER_AUDIO_FORMATS_BY_TIER, DELIVER_FORMAT_QUALITY, DELIVER_WEEKLY_LIMIT, deliverOptions, minimumTierForDeliverFormat } from "@/lib/studio/deliver/policy";
import { listenDayOptions } from "@/lib/studio/listen/listen-policy";
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
    expect(readPlanPaymentsAvailable({})).toBe(false);
    expect(readPlanPaymentsAvailable({ PLAN_PAYMENTS_AVAILABLE: "true" })).toBe(true);
    expect(readPlanPaymentsAvailable({ PLAN_PAYMENTS_AVAILABLE: "false" })).toBe(false);
    expect(yearlySavingPercent(PLAN_POLICY.BRONZE.price)).toBe(33);
    expect(yearlySavingPercent(PLAN_POLICY.GOLD.price)).toBe(33);
    expect(yearlySavingPercent(PLAN_POLICY.FREE.price)).toBeNull();
  });

  it("take length 30 / 60 / 120 / 180 s (Free / Bronze / Silver / Gold); guests cannot record", () => {
    expect(GUEST_POLICY.recording).toBe(false);
    expect(PREMIUM_TIERS.map((t) => PLAN_POLICY[t].recording.maxTakeSeconds)).toEqual([30, 60, 120, 180]);
    expect(PREMIUM_TIERS.map((t) => SAMPLE_POLICY_DEFAULTS[t].maxRecordingSeconds)).toEqual([30, 60, 120, 180]);
    expect(SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxRecordingSeconds).toBe(0);
    expect(SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxSessionsPerUtcDay).toBe(0);
  });

  it("Free: 1 recording a day, valid 24 h, 1 recording track (+ beat), 3 projects, no downloads of beats or files", () => {
    expect(SAMPLE_POLICY_DEFAULTS.FREE.maxSessionsPerUtcDay).toBe(1);
    expect(SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds).toBe(DAY);
    expect(PLAN_POLICY.FREE.studio.maxRecordingTracks).toBe(1);
    expect(maxRecordingTracksForTier("FREE")).toBe(1);
    expect(PREMIUM_TIER_MATRIX.FREE.studioMaxTracks).toBe(2);
    expect(PLAN_POLICY.FREE.downloads.beatsPerDay).toBe(0);
    expect(PREMIUM_TIER_MATRIX.FREE.downloadsDaily).toBe(0);
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
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].studio.maxRecordingTracks,
      (t: (typeof PREMIUM_TIERS)[number]) => PLAN_POLICY[t].downloads.beatsPerDay,
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
    expect(GUEST_POLICY.studio).toBe(false);
  });

  it("guests: no Studio, no recording, no beat downloads, 20 s preview", () => {
    expect(GUEST_POLICY).toEqual({ studio: false, recording: false, beatDownloadsPerDay: 0, previewSeconds: 20 });
  });

  it("recording tracks per project 1 / 2 / 4 / 7 (beat not counted); beat downloads a day 0 / 10 / 25 / 50", () => {
    expect(PREMIUM_TIERS.map(maxRecordingTracksForTier)).toEqual([1, 2, 4, 7]);
    expect(PREMIUM_TIERS.map((t) => PREMIUM_TIER_MATRIX[t].studioMaxTracks)).toEqual([2, 3, 5, 8]);
    expect(PREMIUM_TIERS.map(beatDownloadsPerDayForTier)).toEqual([0, 10, 25, 50]);
    expect(PREMIUM_TIERS.map((t) => PREMIUM_TIER_MATRIX[t].downloadsDaily)).toEqual([0, 10, 25, 50]);
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
  it("Studio tools: lyrics for all, BITEK project memory from Bronze, own presets Silver+, role sets Gold", () => {
    for (const tier of PREMIUM_TIERS) expect(PLAN_POLICY[tier].tools.lyrics).toBe(true);
    expect(bitekMemoryForTier("FREE")).toBe("session");
    expect(bitekMemoryForTier("BRONZE")).toBe("project");
    expect(vocalPresetAccessForTier("FREE")).toEqual({ builtIn: true, maxOwn: 0, roleSets: false });
    expect(vocalPresetAccessForTier("BRONZE").maxOwn).toBe(0);
    expect(vocalPresetAccessForTier("SILVER").maxOwn).toBeGreaterThan(0);
    expect(vocalPresetAccessForTier("SILVER").roleSets).toBe(false);
    expect(vocalPresetAccessForTier("GOLD").roleSets).toBe(true);
    expect(minimumTierFor((p) => p.tools.vocalPresets.maxOwn > 0)).toBe("SILVER");
    expect(minimumTierFor((p) => p.tools.vocalPresets.roleSets)).toBe("GOLD");
    expect(minimumTierFor((p) => p.tools.bitekMemory === "project")).toBe("BRONZE");
  });
});

describe("plan policy — Owner 2026-10-30 (Gold 45 d, Bronze 2 tracks)", () => {
  it("retention 2 / 7 / 30 / 45 days; Gold still the longest", () => {
    expect(PREMIUM_TIERS.map((t) => PLAN_POLICY[t].retentionDays)).toEqual([2, 7, 30, 45]);
    expect(PREMIUM_RETENTION_DAYS.GOLD).toBe(45);
    expect(PREMIUM_TIER_MATRIX.GOLD.artifactRetentionSeconds).toBe(45 * DAY);
  });

  it("Bronze: 2 recording tracks per project, Bit not counted (3 rows with the Bit)", () => {
    expect(PLAN_POLICY.BRONZE.studio.maxRecordingTracks).toBe(2);
    expect(PREMIUM_TIER_MATRIX.BRONZE.studioMaxTracks).toBe(3);
  });

  it("listen link max days are derived from retention (never outlive the files, DB cap 60)", () => {
    for (const t of PREMIUM_TIERS) {
      expect(PLAN_POLICY[t].sharing.listenLinkMaxDays).toBe(Math.min(PLAN_POLICY[t].retentionDays, LISTEN_LINK_DB_MAX_DAYS));
      expect(Math.max(...listenDayOptions(t))).toBe(PLAN_POLICY[t].sharing.listenLinkMaxDays);
    }
    expect(PREMIUM_TIERS.map((t) => PLAN_POLICY[t].sharing.listenLinkMaxDays)).toEqual([2, 7, 30, 45]);
  });
});
