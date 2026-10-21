import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PREMIUM_DOWNLOAD_BY_TIER,
  PREMIUM_UNLOCK_CREDITS_PER_PERIOD,
} from "@/config/premium-export-policy";
import {
  SFM_PLAN_MATRIX,
  SFM_QUALITY_TECH,
  sfmDailyFirstDownloadLimit,
} from "@/lib/sfm/sfm-plan-matrix";

describe("PREMIUM-07 SFM isolation (D-4)", () => {
  it("keeps OD-SFM-07 matrix values", () => {
    expect(SFM_PLAN_MATRIX.FREE).toMatchObject({
      qualities: [],
      firstDownloadsPerDay: 0,
    });
    expect(SFM_PLAN_MATRIX.BRONZE.qualities).toEqual(["MP3_128"]);
    expect(SFM_PLAN_MATRIX.SILVER.qualities).toEqual(["MP3_128", "MP3_192"]);
    expect(SFM_PLAN_MATRIX.GOLD.qualities).toEqual([
      "MP3_128",
      "MP3_192",
      "MP3_320",
      "WAV",
    ]);
    expect(sfmDailyFirstDownloadLimit("GOLD")).toBe(5);
    expect(SFM_QUALITY_TECH.WAV).toMatchObject({
      sampleRate: 44100,
      bitDepth: 16,
    });
  });

  it("Premium ladder differs without mutating SFM", () => {
    expect(PREMIUM_DOWNLOAD_BY_TIER.SILVER).toContain("MP3_256");
    expect(SFM_PLAN_MATRIX.SILVER.qualities).not.toContain("MP3_256");
    expect(PREMIUM_UNLOCK_CREDITS_PER_PERIOD.GOLD).toBe(4);
    expect(SFM_PLAN_MATRIX.GOLD.firstDownloadsPerDay).toBe(5);
  });

  it("SFM grant service does not import premium unlock credits", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/sfm/sfm-grant-service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/premium-export-policy/);
    expect(src).not.toMatch(/unlockCreditsForTier/);
    expect(src).toMatch(/SFM_PLAN_MATRIX|sfmGrantedQualitiesSnapshot/);
  });

  it("premium unlock RPC migration does not alter SFM grant tables", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261021060000_premium_01_08_export_unlock_retention.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/studio_final_version_grants/);
    expect(sql).not.toMatch(/SFM_PLAN_MATRIX/);
    expect(sql).toMatch(/premium_unlock_work/);
  });
});
