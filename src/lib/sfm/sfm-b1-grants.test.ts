/**
 * SFM Stage B1 — plan matrix, Warsaw/DST, resolver, grant RPC contracts.
 * Live Postgres/RLS/concurrency require Docker (may be UNVERIFIED).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { utcDayWindowStart } from "@/lib/downloads/limits";
import { capabilityForRenderTier } from "@/lib/audio/render-job-core";
import {
  SFM_PLAN_MATRIX,
  SFM_QUALITIES,
  sfmDailyFirstDownloadLimit,
  sfmGrantedQualitiesSnapshot,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";
import {
  resolveSfmQualityEntitlement,
  sfmArtifactReadyIsNotEntitlement,
} from "@/lib/sfm/sfm-quality-entitlement";
import {
  isInstantInWarsawDay,
  warsawDayBucket,
  warsawDayBoundsUtc,
  warsawDayDurationMs,
} from "@/lib/sfm/sfm-warsaw-day";
import type { PremiumTier } from "@/types/premium";

const MIGRATION_B1 =
  "supabase/migrations/20261015072956_sfm_b1_version_grants.sql";
const MIGRATION_A =
  "supabase/migrations/20261015072911_sfm_foundation_versions_stages.sql";
const GRANT_SERVICE = "src/lib/sfm/sfm-grant-service.ts";
const WARSAW = "src/lib/sfm/sfm-warsaw-day.ts";
const RESOLVER = "src/lib/sfm/sfm-quality-entitlement.ts";
const MATRIX = "src/lib/sfm/sfm-plan-matrix.ts";
const ARTIFACT_DOWNLOAD = "src/lib/audio/artifact-download.ts";
const MIX_ROUTE = "src/app/api/mix/artifacts/[id]/download/route.ts";
const TAKE_DOWNLOAD = "src/lib/takes/take-download.ts";
const RENDER_JOB_SERVICE = "src/lib/audio/render-job-service.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";
const LIMITS = "src/lib/downloads/limits.ts";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const HOUR = 3600 * 1000;
const TIERS: PremiumTier[] = ["FREE", "BRONZE", "SILVER", "GOLD"];

describe("SFM B1 — SFM_PLAN_MATRIX (P01–P10)", () => {
  it("matches frozen plan × quality × daily limits", () => {
    expect(SFM_PLAN_MATRIX.FREE).toMatchObject({
      qualities: [],
      firstDownloadsPerDay: 0,
    });
    expect(SFM_PLAN_MATRIX.BRONZE.qualities).toEqual(["MP3_128"]);
    expect(SFM_PLAN_MATRIX.BRONZE.firstDownloadsPerDay).toBe(1);
    expect(SFM_PLAN_MATRIX.SILVER.qualities).toEqual(["MP3_128", "MP3_192"]);
    expect(SFM_PLAN_MATRIX.SILVER.firstDownloadsPerDay).toBe(2);
    expect(SFM_PLAN_MATRIX.GOLD.qualities).toEqual([
      "MP3_128",
      "MP3_192",
      "MP3_320",
      "WAV",
    ]);
    expect(SFM_PLAN_MATRIX.GOLD.firstDownloadsPerDay).toBe(5);
  });

  it("enumerates full plan × quality allow/deny matrix", () => {
    const expectAllow: Record<PremiumTier, SfmQuality[]> = {
      FREE: [],
      BRONZE: ["MP3_128"],
      SILVER: ["MP3_128", "MP3_192"],
      GOLD: ["MP3_128", "MP3_192", "MP3_320", "WAV"],
    };
    for (const tier of TIERS) {
      for (const quality of SFM_QUALITIES) {
        const grant = {
          grantedQualities: sfmGrantedQualitiesSnapshot(tier),
        };
        const decision = resolveSfmQualityEntitlement({
          premiumTier: tier,
          quality,
          versionGrant: grant.grantedQualities.length ? grant : null,
          accessMode: "DOWNLOAD",
        });
        const shouldAllow = expectAllow[tier].includes(quality);
        if (tier === "FREE") {
          expect(decision.allow).toBe(false);
          if (!decision.allow) expect(decision.denyCode).toBe("NO_GRANT");
        } else {
          expect(decision.allow).toBe(shouldAllow);
        }
      }
    }
  });

  it("does not use EXPORT_WAV as SFM product gate", () => {
    expect(capabilityForRenderTier("WAV")).toBe("EXPORT_WAV");
    const matrix = read(MATRIX);
    const resolver = read(RESOLVER);
    expect(matrix).not.toMatch(/from ["']@\/lib\/audio\//);
    expect(resolver).not.toMatch(/from ["']@\/lib\/audio\//);
    expect(matrix).not.toMatch(/capabilityForRenderTier\(|canExportOwnTake\(/);
    expect(resolver).not.toMatch(/capabilityForRenderTier\(|canExportOwnTake\(/);
    const bronze = resolveSfmQualityEntitlement({
      premiumTier: "BRONZE",
      quality: "MP3_128",
      versionGrant: { grantedQualities: ["MP3_128"] },
      accessMode: "DOWNLOAD",
    });
    expect(bronze).toEqual({ allow: true });
  });
});

describe("SFM B1 — resolveSfmQualityEntitlement", () => {
  it("CLAIM_GRANT denies FREE; allows paid tiers", () => {
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "FREE",
        quality: "MP3_128",
        versionGrant: null,
        accessMode: "CLAIM_GRANT",
      }),
    ).toEqual({ allow: false, denyCode: "FREE_NO_DOWNLOAD" });
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "BRONZE",
        quality: "MP3_128",
        versionGrant: null,
        accessMode: "CLAIM_GRANT",
      }),
    ).toEqual({ allow: true });
  });

  it("DOWNLOAD/ENQUEUE/RE_DOWNLOAD require grant (NO_GRANT)", () => {
    for (const mode of ["DOWNLOAD", "ENQUEUE", "RE_DOWNLOAD"] as const) {
      const d = resolveSfmQualityEntitlement({
        premiumTier: "GOLD",
        quality: "WAV",
        versionGrant: null,
        accessMode: mode,
      });
      expect(d).toEqual({ allow: false, denyCode: "NO_GRANT" });
    }
  });

  it("strict snapshot: quality outside granted_qualities denied after upgrade", () => {
    // Granted at BRONZE; later GOLD — WAV not in snapshot (OD-SFM-ID-05 strict)
    const d = resolveSfmQualityEntitlement({
      premiumTier: "GOLD",
      quality: "WAV",
      versionGrant: { grantedQualities: ["MP3_128"] },
      accessMode: "DOWNLOAD",
    });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.denyCode).toBe("DOWNGRADE_NEW_QUALITY");
  });

  it("strict snapshot: downgrade keeps historical qualities", () => {
    const d = resolveSfmQualityEntitlement({
      premiumTier: "BRONZE",
      quality: "WAV",
      versionGrant: {
        grantedQualities: ["MP3_128", "MP3_192", "MP3_320", "WAV"],
      },
      accessMode: "RE_DOWNLOAD",
    });
    expect(d).toEqual({ allow: true });
  });

  it("rejects invalid tier / quality", () => {
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "PLATINUM",
        quality: "MP3_128",
        versionGrant: null,
        accessMode: "CLAIM_GRANT",
      }),
    ).toEqual({ allow: false, denyCode: "INVALID_TIER" });
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "GOLD",
        quality: "FLAC",
        versionGrant: { grantedQualities: ["WAV"] },
        accessMode: "DOWNLOAD",
      }),
    ).toEqual({ allow: false, denyCode: "INVALID_QUALITY" });
  });

  it("READY/object_key alone is not entitlement", () => {
    expect(sfmArtifactReadyIsNotEntitlement()).toBe(true);
  });
});

describe("SFM B1 — Europe/Warsaw day + DST (W01–W04)", () => {
  it("day bucket flips at Warsaw midnight, not UTC midnight", () => {
    // 2026-06-15 22:30 UTC = 2026-06-16 00:30 Warsaw (CEST)
    const beforeUtcMidnight = new Date("2026-06-15T21:30:00.000Z"); // 23:30 Warsaw
    const afterWarsawMidnight = new Date("2026-06-15T22:30:00.000Z"); // 00:30 Warsaw
    expect(warsawDayBucket(beforeUtcMidnight)).toBe("2026-06-15");
    expect(warsawDayBucket(afterWarsawMidnight)).toBe("2026-06-16");
    expect(utcDayWindowStart(afterWarsawMidnight).toISOString()).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("spring DST day is 23 hours (2026-03-29 Europe/Warsaw)", () => {
    const ms = warsawDayDurationMs("2026-03-29");
    expect(ms).toBe(23 * HOUR);
    const { start, end } = warsawDayBoundsUtc("2026-03-29");
    expect(isInstantInWarsawDay(start, "2026-03-29")).toBe(true);
    expect(isInstantInWarsawDay(new Date(end.getTime() - 1), "2026-03-29")).toBe(
      true,
    );
    expect(isInstantInWarsawDay(end, "2026-03-29")).toBe(false);
  });

  it("autumn DST day is 25 hours (2026-10-25 Europe/Warsaw)", () => {
    const ms = warsawDayDurationMs("2026-10-25");
    expect(ms).toBe(25 * HOUR);
  });

  it("regular day is 24 hours", () => {
    expect(warsawDayDurationMs("2026-06-15")).toBe(24 * HOUR);
  });

  it("SFM Warsaw helpers do not import utcDayWindowStart", () => {
    const warsaw = read(WARSAW);
    const grant = read(GRANT_SERVICE);
    expect(warsaw).not.toMatch(
      /import\s*\{[^}]*utcDayWindowStart|from ["']@\/lib\/downloads\/limits["']/,
    );
    expect(grant).not.toMatch(
      /import\s*\{[^}]*utcDayWindowStart|from ["']@\/lib\/downloads\/limits["']/,
    );
    expect(read(LIMITS)).toMatch(/export function utcDayWindowStart/);
  });
});

describe("SFM B1 — migration / RPC contracts", () => {
  const sql = read(MIGRATION_B1);

  it("depends on Stage A versions table (present on tip)", () => {
    expect(read(MIGRATION_A)).toMatch(/studio_final_versions/);
    expect(sql).toMatch(/REFERENCES public\.studio_final_versions/);
  });

  it("creates grants table with UNIQUE(user, version) and quality CHECK", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.studio_final_version_grants/);
    expect(sql).toMatch(/UNIQUE \(user_id, version_id\)/);
    expect(sql).toMatch(/granted_qualities/);
    expect(sql).toMatch(/day_bucket date NOT NULL/);
    expect(sql).toMatch(/source IN \('DAILY', 'PAID_SLOT'\)/);
  });

  it("enables RLS SELECT-own; mutations service_role only", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/studio_final_version_grants_select_own/);
    expect(sql).toMatch(/Only service_role may mutate studio_final_version_grants/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.studio_final_version_grants[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.studio_final_version_grants TO authenticated/,
    );
  });

  it("sfm_claim_version_grant: Warsaw day, advisory lock, ownership, EXPORTS_ELIGIBLE", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sfm_claim_version_grant/);
    expect(sql).toMatch(/timezone\('Europe\/Warsaw', now\(\)\)\)::date/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/NOT_OWNER/);
    expect(sql).toMatch(/EXPORTS_ELIGIBLE/);
    expect(sql).toMatch(/LIMIT_EXCEEDED/);
    expect(sql).toMatch(/unique_violation/);
    expect(sql).toMatch(/reused/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.sfm_claim_version_grant[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sfm_claim_version_grant[\s\S]*TO service_role/,
    );
  });

  it("B1 does not implement paid slot consume / checkout", () => {
    expect(sql).not.toMatch(/studio_final_paid_day_slots/);
    expect(sql).not.toMatch(/sfm_upsert_paid_slot/);
    expect(sql).toMatch(/paid slots out of scope|No paid slots/i);
  });

  it("does not add render_jobs.kind", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.render_jobs/);
    expect(sql).not.toMatch(/SFM_MIX_PREPARE|SFM_MASTER_BAKE/);
  });

  it("documents concurrency: one grant row wins unique race", () => {
    // Contract-level concurrency guarantee (live DB UNVERIFIED without Docker)
    expect(sql).toMatch(/UNIQUE \(user_id, version_id\)/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/WHEN unique_violation THEN/);
  });
});

describe("SFM B1 — grant service source contracts", () => {
  const service = read(GRANT_SERVICE);

  it("gates on SFM_VERSIONS_V1 and server entitlement", () => {
    expect(service).toMatch(/isSfmVersionsV1Enabled/);
    expect(service).toMatch(/resolveProductEntitlementForAuthContext/);
    expect(service).toMatch(/sfmGrantedQualitiesSnapshot/);
    expect(service).toMatch(/sfmDailyFirstDownloadLimit/);
    expect(service).toMatch(/sfm_claim_version_grant/);
  });

  it("rejects client-supplied plan / user / qualities / day_bucket", () => {
    expect(service).toMatch(/premiumTier/);
    expect(service).toMatch(/granted_qualities/);
    expect(service).toMatch(/Client must not supply/);
  });

  it("daily limits match matrix helpers", () => {
    expect(sfmDailyFirstDownloadLimit("FREE")).toBe(0);
    expect(sfmDailyFirstDownloadLimit("BRONZE")).toBe(1);
    expect(sfmDailyFirstDownloadLimit("SILVER")).toBe(2);
    expect(sfmDailyFirstDownloadLimit("GOLD")).toBe(5);
  });
});

describe("SFM B1 — regression MIX / TAKE / E3 / Sacred WIP", () => {
  it("mix download route still has no SFM grant claim (OD-06 domain gate is separate)", () => {
    const mix = read(MIX_ROUTE);
    const art = read(ARTIFACT_DOWNLOAD);
    expect(mix).not.toMatch(/sfm_claim_version_grant|studio_final_version_grants/);
    // OD-SFM-ID-06 may classify domain on mix path; grant resolver stays SFM-route-only.
    expect(art).not.toMatch(/sfm_claim_version_grant|resolveSfmQualityEntitlement/);
  });

  it("does not alter TAKE download or render job service", () => {
    expect(read(TAKE_DOWNLOAD)).not.toMatch(/sfm_claim_version_grant|SFM_PLAN_MATRIX/);
    expect(read(RENDER_JOB_SERVICE)).not.toMatch(
      /sfm_claim_version_grant|studio_final_version_grants/,
    );
  });

  it("does not modify Sacred WIP eligibility service", () => {
    expect(read(ELIGIBILITY)).not.toMatch(
      /studio_final_version_grants|sfm_claim_version_grant|SFM_PLAN_MATRIX/,
    );
  });
});
