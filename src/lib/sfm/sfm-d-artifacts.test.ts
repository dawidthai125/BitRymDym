/**
 * SFM Stage D — F02b keys, encode params, promote, retention, grants.
 * Live Postgres / RLS / SQL concurrency = UNVERIFIED without Docker.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUDIO_CODEC } from "@/config/audio-render";
import {
  buildStudioExportArtifactObjectKey,
  expectedStudioExportArtifactObjectKey,
} from "@/lib/audio/artifact-object-key";
import { isPollerOutOfScopeKind } from "@/lib/audio/studio-export-poller-qualify";
import {
  buildSfmQualityArtifactObjectKey,
  expectedSfmQualityArtifactObjectKey,
  extensionForSfmQuality,
  isLegacyStudioExportWavObjectKey,
  isSfmF02bObjectKey,
} from "@/lib/sfm/sfm-artifact-object-key";
import { mapSfmRpcErrorMessage } from "@/lib/sfm/sfm-domain";
import {
  decideConcurrentPromoteOutcome,
  decideSfmFinalizeRetry,
  decideSfmPromote,
  sfmPromoteRaceWinnerPolicy,
  uploadSetsIsCurrent,
} from "@/lib/sfm/sfm-promote-guards";
import {
  expectedEncodeParamsForSfmQuality,
  renderJobTierForSfmQuality,
} from "@/lib/sfm/sfm-quality-encode";
import {
  resolveSfmQualityEntitlement,
  sfmArtifactReadyIsNotEntitlement,
} from "@/lib/sfm/sfm-quality-entitlement";
import {
  computeSfmExpiresAtFromMasterSucceeded,
  grantGuaranteesEternalObjectAccess,
  isSfmCurrentArtifactPresentable,
  paidSlotExtendsSfmRetention,
  resolveSfmArtifactExpiresAtIso,
  SFM_RETENTION_DAYS,
  sfmQualitiesShareVersionExpiresAt,
} from "@/lib/sfm/sfm-retention";
import {
  SFM_QUALITIES,
  SFM_QUALITY_TECH,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";
import { SFM_EXECUTOR_JOB_KINDS } from "@/types/domain";

const MIGRATION_D =
  "supabase/migrations/20261015073249_sfm_d_artifacts_promote_retention.sql";
const MIGRATION_C =
  "supabase/migrations/20261015073145_sfm_c_executor_jobs.sql";
const POLLER = "src/lib/audio/studio-export-poller.ts";
const EXECUTOR = "src/lib/sfm/sfm-executor-service.ts";
const ARTIFACT_SVC = "src/lib/sfm/sfm-artifact-service.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VERSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOB_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ART_A = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ART_B = "11111111-1111-4111-8111-111111111111";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SFM Stage D — D1 F02b keys + isolation", () => {
  it("A01 builds distinct keys for all four qualities with correct ext", () => {
    for (const quality of SFM_QUALITIES) {
      const key = buildSfmQualityArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        versionId: VERSION,
        quality,
        jobId: JOB_A,
      });
      const ext = extensionForSfmQuality(quality);
      expect(key).toBe(
        `user/${OWNER}/studio-export/${PROJECT}/versions/${VERSION}/qualities/${quality}/${JOB_A}.${ext}`,
      );
      expect(isSfmF02bObjectKey(key)).toBe(true);
      expect(
        expectedSfmQualityArtifactObjectKey({
          ownerId: OWNER,
          projectId: PROJECT,
          versionId: VERSION,
          quality,
          jobId: JOB_A,
          objectKey: key,
        }),
      ).toBe(true);
    }
  });

  it("A02 rejects unknown quality token", () => {
    expect(() =>
      buildSfmQualityArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        versionId: VERSION,
        quality: "FLAC",
        jobId: JOB_A,
      }),
    ).toThrow(/Invalid SFM quality/);
  });

  it("A10 different version/job/quality never collide", () => {
    const a = buildSfmQualityArtifactObjectKey({
      ownerId: OWNER,
      projectId: PROJECT,
      versionId: VERSION,
      quality: "MP3_128",
      jobId: JOB_A,
    });
    const b = buildSfmQualityArtifactObjectKey({
      ownerId: OWNER,
      projectId: PROJECT,
      versionId: VERSION,
      quality: "MP3_192",
      jobId: JOB_A,
    });
    const c = buildSfmQualityArtifactObjectKey({
      ownerId: OWNER,
      projectId: PROJECT,
      versionId: VERSION,
      quality: "MP3_128",
      jobId: JOB_B,
    });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("A09 legacy F02 WAV key remains read-compatible and distinct from F02b", () => {
    const legacy = buildStudioExportArtifactObjectKey({
      ownerId: OWNER,
      projectId: PROJECT,
      jobId: JOB_A,
      tier: "WAV",
    });
    expect(isLegacyStudioExportWavObjectKey(legacy)).toBe(true);
    expect(isSfmF02bObjectKey(legacy)).toBe(false);
    expect(
      expectedStudioExportArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        jobId: JOB_A,
        objectKey: legacy,
      }),
    ).toBe(true);
  });
});

describe("SFM Stage D — D2 encode params + QC contract", () => {
  it("maps all four qualities to SSOT AUDIO_CODEC / SFM_QUALITY_TECH", () => {
    expect(expectedEncodeParamsForSfmQuality("MP3_128")).toMatchObject({
      container: "mp3",
      cbrKbps: AUDIO_CODEC.BASIC_MP3_BITRATE_KBPS,
    });
    expect(expectedEncodeParamsForSfmQuality("MP3_192")).toMatchObject({
      container: "mp3",
      cbrKbps: AUDIO_CODEC.MP3_192_BITRATE_KBPS,
    });
    expect(expectedEncodeParamsForSfmQuality("MP3_320")).toMatchObject({
      container: "mp3",
      cbrKbps: AUDIO_CODEC.HQ_MP3_BITRATE_KBPS,
    });
    expect(expectedEncodeParamsForSfmQuality("WAV")).toEqual({
      container: "wav",
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    });
    expect(SFM_QUALITY_TECH.WAV).toMatchObject({
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    });
    expect(renderJobTierForSfmQuality("MP3_128")).toBe("BASIC_MP3");
    expect(renderJobTierForSfmQuality("WAV")).toBe("WAV");
  });

  it("finalize re-runs qcSfmQualityBytes + checksum (not qcPassed alone)", () => {
    const svc = read(ARTIFACT_SVC);
    expect(svc).toMatch(/qcSfmQualityBytes/);
    expect(svc).toMatch(/checksum mismatch vs encoded bytes/);
    expect(svc).toMatch(/is_current: false/);
    expect(svc).toMatch(/sfm_promote_current_artifact/);
    expect(svc).toMatch(/uploadSetsIsCurrent/);
    expect(svc).not.toMatch(/if \(!params\.encoded\.qcPassed\)/);
  });
});

describe("SFM Stage D — F-01 FIRST_COMMIT_WINS promote", () => {
  const baseArt = {
    id: ART_A,
    status: "READY",
    deletedAt: null,
    isCurrent: false,
    sfmVersionId: VERSION,
    sfmQuality: "MP3_128" as SfmQuality,
    projectId: PROJECT,
    ownerId: OWNER,
    renderJobId: JOB_A,
    byteSize: 1000,
    checksum: "sha256:abc",
  };
  const baseJob = {
    id: JOB_A,
    status: "SUCCEEDED",
    kind: "SFM_QUALITY_ENCODE",
    ownerId: OWNER,
    projectId: PROJECT,
    sfmVersionId: VERSION,
    sfmQuality: "MP3_128",
  };
  const baseVersion = {
    id: VERSION,
    ownerId: OWNER,
    projectId: PROJECT,
    status: "EXPORTS_ELIGIBLE",
    expiresAt: new Date(Date.now() + 864e5).toISOString(),
  };
  const baseGrant = {
    userId: OWNER,
    versionId: VERSION,
    grantedQualities: ["MP3_128", "MP3_192"] as SfmQuality[],
  };

  it("first artifact ALLOW; second same version/quality CONFLICT without demoting", () => {
    expect(sfmPromoteRaceWinnerPolicy()).toBe("FIRST_COMMIT_WINS");
    expect(
      decideSfmPromote({
        artifact: baseArt,
        job: baseJob,
        version: baseVersion,
        grant: baseGrant,
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toEqual({ outcome: "ALLOW_PROMOTE", mutatesPointer: true });

    const second = decideSfmPromote({
      artifact: { ...baseArt, id: ART_B, renderJobId: JOB_B },
      job: { ...baseJob, id: JOB_B },
      version: baseVersion,
      grant: baseGrant,
      existingCurrentArtifactId: ART_A,
      nowMs: Date.now(),
    });
    expect(second).toEqual({
      outcome: "DENY",
      mutatesPointer: false,
      code: "CONFLICT",
    });
    expect(
      decideConcurrentPromoteOutcome({
        firstWinnerArtifactId: ART_A,
        secondLoserArtifactId: ART_B,
      }),
    ).toMatchObject({
      policy: "FIRST_COMMIT_WINS",
      winnerIsCurrent: true,
      loserIsCurrent: false,
      winnerDemoted: false,
      historyPreserved: true,
      silentOverwrite: false,
    });
  });

  it("idempotent re-promote of same current artifact", () => {
    expect(
      decideSfmPromote({
        artifact: { ...baseArt, isCurrent: true },
        job: baseJob,
        version: baseVersion,
        grant: baseGrant,
        existingCurrentArtifactId: ART_A,
        nowMs: Date.now(),
      }),
    ).toEqual({
      outcome: "IDEMPOTENT_ALREADY_CURRENT",
      mutatesPointer: false,
    });
  });

  it("different quality or version does not conflict semantically", () => {
    expect(
      decideSfmPromote({
        artifact: { ...baseArt, sfmQuality: "MP3_192" },
        job: { ...baseJob, sfmQuality: "MP3_192" },
        version: baseVersion,
        grant: baseGrant,
        // current exists for MP3_128 only — different quality slot
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toEqual({ outcome: "ALLOW_PROMOTE", mutatesPointer: true });
  });

  it("upload alone never sets is_current; QC payload required", () => {
    expect(uploadSetsIsCurrent()).toBe(false);
    expect(
      decideSfmPromote({
        artifact: { ...baseArt, byteSize: null, checksum: null },
        job: baseJob,
        version: baseVersion,
        grant: baseGrant,
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toMatchObject({ outcome: "DENY", code: "QC_FAILED", mutatesPointer: false });
  });

  it("job–version–quality mismatch DENY; SQL never demotes winner", () => {
    expect(
      decideSfmPromote({
        artifact: baseArt,
        job: { ...baseJob, sfmVersionId: PROJECT },
        version: baseVersion,
        grant: baseGrant,
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toMatchObject({ outcome: "DENY", code: "CONFLICT", mutatesPointer: false });

    const sql = read(MIGRATION_D);
    expect(sql).toMatch(/FIRST_COMMIT_WINS/);
    expect(sql).toMatch(/do NOT demote/);
    expect(sql).toMatch(/never demoted/);
    expect(sql).not.toMatch(
      /Demote prior current for same \(version, quality\)/,
    );
    expect(sql).toMatch(/audio_artifacts_sfm_current_ready_uidx/);
    expect(sql).toMatch(/WHEN unique_violation THEN/);
    // Live SQL concurrency = UNVERIFIED without Docker/Postgres.
  });
});

describe("SFM Stage D — D4 retention F03b", () => {
  it("A11/A12 90d from MASTER; all qualities share version expires_at", () => {
    expect(SFM_RETENTION_DAYS).toBe(90);
    expect(sfmQualitiesShareVersionExpiresAt()).toBe(true);
    const anchor = new Date("2026-10-14T12:00:00.000Z");
    const exp = computeSfmExpiresAtFromMasterSucceeded(anchor);
    // Oct 14 + 90 calendar days (matches PG interval '90 days' style via setUTCDate).
    expect(exp.toISOString()).toBe("2027-01-12T12:00:00.000Z");
    const shared = "2027-01-12T12:00:00.000Z";
    for (const _q of SFM_QUALITIES) {
      expect(resolveSfmArtifactExpiresAtIso({ versionExpiresAt: shared })).toBe(
        shared,
      );
    }
  });

  it("A13 expired version not presentable as current; grant ≠ eternal file", () => {
    expect(grantGuaranteesEternalObjectAccess()).toBe(false);
    expect(paidSlotExtendsSfmRetention()).toBe(false);
    const now = Date.parse("2026-12-01T00:00:00.000Z");
    expect(
      isSfmCurrentArtifactPresentable({
        isCurrent: true,
        status: "READY",
        deletedAt: null,
        artifactExpiresAt: "2026-11-13T12:00:00.000Z",
        versionStatus: "EXPIRED",
        versionExpiresAt: "2026-11-13T12:00:00.000Z",
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      isSfmCurrentArtifactPresentable({
        isCurrent: true,
        status: "READY",
        deletedAt: null,
        artifactExpiresAt: "2026-12-31T00:00:00.000Z",
        versionStatus: "EXPORTS_ELIGIBLE",
        versionExpiresAt: "2026-12-31T00:00:00.000Z",
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("SQL expire janitor is SFM-scoped (no TAKE/E3 delete)", () => {
    const sql = read(MIGRATION_D);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sfm_expire_versions/);
    expect(sql).toMatch(/status = 'EXPIRED'/);
    expect(sql).toMatch(/current_final_version_id = NULL/);
    expect(sql).toMatch(/a\.sfm_version_id IN/);
    expect(sql).toMatch(/Ignores TAKE\/E3/);
  });
});

describe("SFM Stage D — F-03 grant / granted_qualities (DB + app)", () => {
  const baseArt = {
    id: ART_A,
    status: "READY",
    deletedAt: null,
    isCurrent: false,
    sfmVersionId: VERSION,
    sfmQuality: "MP3_128" as SfmQuality,
    projectId: PROJECT,
    ownerId: OWNER,
    renderJobId: JOB_A,
    byteSize: 1000,
    checksum: "sha256:abc",
  };
  const baseJob = {
    id: JOB_A,
    status: "SUCCEEDED",
    kind: "SFM_QUALITY_ENCODE",
    ownerId: OWNER,
    projectId: PROJECT,
    sfmVersionId: VERSION,
    sfmQuality: "MP3_128",
  };
  const baseVersion = {
    id: VERSION,
    ownerId: OWNER,
    projectId: PROJECT,
    status: "EXPORTS_ELIGIBLE",
    expiresAt: new Date(Date.now() + 864e5).toISOString(),
  };

  it("NO_GRANT / quality outside snapshot / wrong owner grant DENY", () => {
    expect(sfmArtifactReadyIsNotEntitlement()).toBe(true);
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "GOLD",
        quality: "WAV",
        versionGrant: null,
        accessMode: "ENQUEUE",
      }),
    ).toEqual({ allow: false, denyCode: "NO_GRANT" });

    expect(
      decideSfmPromote({
        artifact: baseArt,
        job: baseJob,
        version: baseVersion,
        grant: null,
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toMatchObject({ outcome: "DENY", code: "NO_GRANT", mutatesPointer: false });

    expect(
      decideSfmPromote({
        artifact: baseArt,
        job: baseJob,
        version: baseVersion,
        grant: {
          userId: OWNER,
          versionId: VERSION,
          grantedQualities: ["WAV"],
        },
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toMatchObject({
      outcome: "DENY",
      code: "QUALITY_DENIED",
      mutatesPointer: false,
    });

    expect(
      decideSfmPromote({
        artifact: baseArt,
        job: baseJob,
        version: baseVersion,
        grant: {
          userId: PROJECT,
          versionId: VERSION,
          grantedQualities: ["MP3_128"],
        },
        existingCurrentArtifactId: null,
        nowMs: Date.now(),
      }),
    ).toMatchObject({ outcome: "DENY", code: "NO_GRANT", mutatesPointer: false });
  });

  it("SQL enqueue + promote require grant and quality ∈ granted_qualities", () => {
    const sql = read(MIGRATION_D);
    expect(sql).toMatch(/F-03 — harden sfm_enqueue_quality_encode/);
    expect(sql).toMatch(/RAISE EXCEPTION 'NO_GRANT'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'QUALITY_DENIED'/);
    expect(sql).toMatch(/p_quality = ANY \(v_grant\.granted_qualities\)/);
    expect(sql).toMatch(/v_art\.sfm_quality = ANY \(v_grant\.granted_qualities\)/);
    expect(sql).toMatch(/strict snapshot/);
  });

  it("app enqueue still gates + download route not claimed as AuthZ", () => {
    const src = read(EXECUTOR);
    expect(src).toMatch(/studio_final_version_grants/);
    expect(src).toMatch(/resolveSfmQualityEntitlement/);
    expect(src).toMatch(/accessMode: \"ENQUEUE\"/);
    expect(sfmArtifactReadyIsNotEntitlement()).toBe(true);
    expect(mapSfmRpcErrorMessage("QC_FAILED")).toBe("QC_FAILED");
    expect(mapSfmRpcErrorMessage("NO_GRANT")).toBe("NO_GRANT");
    expect(mapSfmRpcErrorMessage("QUALITY_DENIED")).toBe("QUALITY_DENIED");
  });
});

describe("SFM Stage D — F-02 partial finalize recovery (no auto-QUEUED)", () => {
  it("documents reachable retry states without demoting FIRST winner", () => {
    expect(
      decideSfmFinalizeRetry({
        phase: "UPLOAD_ONLY",
        sameJobId: true,
        sameObjectKey: true,
        otherCurrentExists: false,
      }),
    ).toMatchObject({
      canRetryFinalize: true,
      mayUpsertSameObjectKey: true,
      autoRequeue: false,
    });

    expect(
      decideSfmFinalizeRetry({
        phase: "ARTIFACT_READY_JOB_SUCCEEDED_NOT_CURRENT",
        sameJobId: true,
        sameObjectKey: true,
        otherCurrentExists: true,
      }),
    ).toMatchObject({
      canRetryFinalize: true,
      autoRequeue: false,
      promotesIfOtherCurrent: "CONFLICT",
    });

    expect(
      decideSfmFinalizeRetry({
        phase: "LOSER_READY_NOT_CURRENT",
        sameJobId: true,
        sameObjectKey: true,
        otherCurrentExists: true,
      }),
    ).toMatchObject({
      promotesIfOtherCurrent: "CONFLICT",
      autoRequeue: false,
    });

    expect(
      decideSfmFinalizeRetry({
        phase: "COMPLETE_CURRENT",
        sameJobId: true,
        sameObjectKey: true,
        otherCurrentExists: false,
      }).notes,
    ).toMatch(/Idempotent/);

    const svc = read(ARTIFACT_SVC);
    expect(svc).toMatch(/upsert: true/);
    expect(svc).toMatch(/existingArt/);
    expect(svc).not.toMatch(/status:\s*[\"']QUEUED[\"']/);
  });
});

describe("SFM Stage D — type SSOT contracts", () => {
  it("imports RenderJobStatus/Tier from domain; not Record/Tier from render-job-core", () => {
    const svc = read(ARTIFACT_SVC);
    expect(svc).toMatch(
      /import type \{\s*RenderJobStatus,\s*RenderJobTier\s*\} from ["']@\/types\/domain["']/,
    );
    expect(svc).not.toMatch(
      /from ["']@\/lib\/audio\/render-job-core["'][\s\S]*RenderJobRecord/,
    );
    expect(svc).not.toMatch(
      /type RenderJobRecord|type RenderJobTier[\s\S]*from ["']@\/lib\/audio\/render-job-core["']/,
    );
    // Canonical homes (no duplicate type defs in SFM finalize service)
    const domain = read("src/types/domain.ts");
    expect(domain).toMatch(/export type RenderJobTier/);
    expect(domain).toMatch(/export type RenderJobStatus/);
    const jobService = read("src/lib/audio/render-job-service.ts");
    expect(jobService).toMatch(/export type RenderJobRecord/);
  });
});

describe("SFM Stage D — regression Studio / E3 / TAKE / poller / Sacred WIP", () => {
  it("does not widen STUDIO poller; SFM kinds remain out of scope", () => {
    const poller = read(POLLER);
    expect(poller).not.toMatch(/claim_next_sfm_job|claimNextSfmJob|sfm_promote/);
    for (const kind of SFM_EXECUTOR_JOB_KINDS) {
      expect(isPollerOutOfScopeKind(kind)).toBe(true);
    }
    const c = read(MIGRATION_C);
    expect(c).toMatch(/claim_next_sfm_job/);
    expect(c).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.claim_next_studio_export_job/,
    );
  });

  it("XOR migration preserves MIX/TAKE/legacy project legs", () => {
    const sql = read(MIGRATION_D);
    expect(sql).toMatch(/mix_session_id IS NOT NULL/);
    expect(sql).toMatch(/take_id IS NOT NULL/);
    expect(sql).toMatch(/sfm_version_id IS NULL/);
    expect(sql).toMatch(/sfm_version_id IS NOT NULL/);
  });

  it("does not modify Sacred WIP recording-eligibility-service", () => {
    const eligibility = read(ELIGIBILITY);
    expect(eligibility).not.toMatch(
      /sfm_version_id|SFM_QUALITY_ENCODE|sfm_promote|F02b/,
    );
  });
});
