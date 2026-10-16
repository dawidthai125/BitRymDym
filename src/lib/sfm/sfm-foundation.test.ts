/**
 * SFM Foundation Stage A — unit + migration/source contracts.
 * Live Postgres/RLS requires local Supabase/Docker (may be unavailable).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isSfmVersionsV1Enabled } from "@/config/audio-render";
import {
  assertCanCompleteSfmStage,
  assertCanStartSfmStage,
  isSfmStageKind,
  mapSfmRpcErrorMessage,
  SFM_STAGE_KINDS,
  SfmDomainError,
} from "@/lib/sfm/sfm-domain";
import {
  buildSfmAcceptContentSnapshot,
  SFM_ACCEPT_SNAPSHOT_KIND,
} from "@/lib/sfm/sfm-version-snapshot";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

const MIGRATION =
  "supabase/migrations/20261014120000_sfm_foundation_versions_stages.sql";
const STUDIO_EXPORT_SERVICE = "src/lib/audio/studio-export-service.ts";
const RENDER_PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const RENDER_JOB_SERVICE = "src/lib/audio/render-job-service.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";
const FOUNDATION_SERVICE = "src/lib/sfm/sfm-foundation-service.ts";

const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function baseDocument(
  overrides: Partial<StudioProjectDocument["project"]> = {},
): StudioProjectDocument {
  return {
    project: {
      id: PROJECT_ID,
      title: "Test",
      status: "ACTIVE",
      tempoBpm: 120,
      timelineLengthMs: 60_000,
      beatId: BEAT_ID,
      updatedAt: "2026-10-14T00:00:00.000Z",
      createdAt: "2026-10-14T00:00:00.000Z",
      timeSignatureNum: 4,
      timeSignatureDen: 4,
      masterGainDb: 0,
      masterPan: 0,
      masterFxChain: emptyStudioFxChain(),
      documentVersion: 3,
      schemaVersion: 1,
      ...overrides,
    },
    tracks: [
      {
        id: "t1",
        projectId: PROJECT_ID,
        name: "Vox",
        trackType: "VOCAL",
        sortOrder: 0,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        recordArmed: false,
        inputDeviceHint: null,
        outputRoute: "master",
        effectsChain: emptyStudioFxChain(),
      },
    ],
    clips: [
      {
        id: "c1",
        trackId: "t1",
        sourceKind: "TAKE",
        sourceTakeId: TAKE_A,
        sourceBeatId: null,
        sourceArtifactId: null,
        timelineStartMs: 0,
        durationMs: 1000,
        sourceOffsetMs: 0,
        gainDb: 0,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    ],
  };
}

describe("SFM Foundation — feature flag", () => {
  it("defaults OFF (fail-closed)", () => {
    expect(isSfmVersionsV1Enabled(undefined)).toBe(false);
    expect(isSfmVersionsV1Enabled("")).toBe(false);
    expect(isSfmVersionsV1Enabled("garbage")).toBe(false);
    expect(isSfmVersionsV1Enabled("0")).toBe(false);
    expect(isSfmVersionsV1Enabled("false")).toBe(false);
  });

  it("enables only on explicit true-class values", () => {
    expect(isSfmVersionsV1Enabled("1")).toBe(true);
    expect(isSfmVersionsV1Enabled("true")).toBe(true);
    expect(isSfmVersionsV1Enabled("YES")).toBe(true);
    expect(isSfmVersionsV1Enabled("on")).toBe(true);
  });

  it("service gates Accept behind SFM_VERSIONS_V1", () => {
    const service = read(FOUNDATION_SERVICE);
    expect(service).toMatch(/assertSfmVersionsEnabled/);
    expect(service).toMatch(/isSfmVersionsV1Enabled/);
    expect(service).toMatch(/DISABLED/);
  });
});

describe("SFM Foundation — domain kinds / transitions (V01/V06/V10)", () => {
  it("exposes only SFM_MIX and SFM_MASTER stage kinds", () => {
    expect(SFM_STAGE_KINDS).toEqual(["SFM_MIX", "SFM_MASTER"]);
    expect(isSfmStageKind("SFM_MIX")).toBe(true);
    expect(isSfmStageKind("SFM_MASTER")).toBe(true);
    expect(isSfmStageKind("MIX")).toBe(false);
    expect(isSfmStageKind("STUDIO_EXPORT")).toBe(false);
  });

  it("denies MASTER start before MIX SUCCEEDED", () => {
    expect(() =>
      assertCanStartSfmStage({
        kind: "SFM_MASTER",
        mixStatus: "PENDING",
        currentStatus: "PENDING",
      }),
    ).toThrow(SfmDomainError);
    expect(() =>
      assertCanStartSfmStage({
        kind: "SFM_MASTER",
        mixStatus: "RUNNING",
        currentStatus: "PENDING",
      }),
    ).toThrow(/ILLEGAL_TRANSITION|SFM_MASTER/);
  });

  it("allows MIX start from PENDING and MASTER after MIX SUCCEEDED", () => {
    expect(() =>
      assertCanStartSfmStage({
        kind: "SFM_MIX",
        mixStatus: null,
        currentStatus: "PENDING",
      }),
    ).not.toThrow();
    expect(() =>
      assertCanStartSfmStage({
        kind: "SFM_MASTER",
        mixStatus: "SUCCEEDED",
        currentStatus: "PENDING",
      }),
    ).not.toThrow();
  });

  it("denies MASTER complete SUCCEEDED before MIX SUCCEEDED", () => {
    expect(() =>
      assertCanCompleteSfmStage({
        kind: "SFM_MASTER",
        mixStatus: "PENDING",
        currentStatus: "RUNNING",
        nextStatus: "SUCCEEDED",
      }),
    ).toThrow(SfmDomainError);
  });

  it("treats identical terminal complete as idempotent", () => {
    expect(() =>
      assertCanCompleteSfmStage({
        kind: "SFM_MIX",
        mixStatus: null,
        currentStatus: "SUCCEEDED",
        nextStatus: "SUCCEEDED",
      }),
    ).not.toThrow();
  });
});

describe("SFM Foundation — Accept snapshot immutability helpers", () => {
  it("builds Accept snapshot with digest distinct from job enqueue", () => {
    const snapshot = buildSfmAcceptContentSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-14T12:00:00.000Z",
      document: baseDocument(),
    });
    expect(snapshot.snapshotKind).toBe(SFM_ACCEPT_SNAPSHOT_KIND);
    expect(snapshot.documentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot).not.toHaveProperty("jobId");
  });

  it("rejects empty session (no TAKE/BEAT_REF) on Accept", () => {
    const empty: StudioProjectDocument = {
      ...baseDocument(),
      clips: [],
    };
    expect(() =>
      buildSfmAcceptContentSnapshot({
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        documentVersion: 3,
        capturedAt: "2026-10-14T12:00:00.000Z",
        document: empty,
      }),
    ).toThrow(SfmDomainError);
  });

  it("rejects stale documentVersion (V02)", () => {
    expect(() =>
      buildSfmAcceptContentSnapshot({
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        documentVersion: 2,
        capturedAt: "2026-10-14T12:00:00.000Z",
        document: baseDocument({ documentVersion: 3 }),
      }),
    ).toThrow(/VERSION_CONFLICT|documentVersion/);
  });

  it("digest changes when document edits after Accept baseline (V05)", () => {
    const a = buildSfmAcceptContentSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-14T12:00:00.000Z",
      document: baseDocument(),
    });
    const edited = baseDocument({ documentVersion: 4, title: "Edited" });
    const b = buildSfmAcceptContentSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 4,
      capturedAt: "2026-10-14T12:01:00.000Z",
      document: edited,
    });
    expect(a.documentDigest).not.toBe(b.documentDigest);
    expect(a.document.project.title).toBe("Test");
    expect(b.document.project.title).toBe("Edited");
  });
});

describe("SFM Foundation — migration / RLS / RPC contracts", () => {
  const sql = read(MIGRATION);

  it("creates versions + stages tables with domain kinds only", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.studio_final_versions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.studio_final_stages/);
    expect(sql).toMatch(/CHECK \(kind IN \('SFM_MIX', 'SFM_MASTER'\)\)/);
    expect(sql).toMatch(/UNIQUE \(version_id, kind\)/);
    expect(sql).toMatch(/current_final_version_id/);
  });

  it("enables RLS + SELECT-own policies; mutations service_role only", () => {
    expect(sql).toMatch(
      /ENABLE ROW LEVEL SECURITY[\s\S]*studio_final_versions|studio_final_versions[\s\S]*ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(/studio_final_versions_select_own/);
    expect(sql).toMatch(/studio_final_stages_select_own/);
    expect(sql).toMatch(
      /Only service_role may mutate studio_final_versions/,
    );
    expect(sql).toMatch(/Only service_role may mutate studio_final_stages/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.studio_final_versions FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.studio_final_versions TO authenticated/,
    );
  });

  it("defines sfm_accept_version with CAS + advisory lock (V01/V07 concurrency)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sfm_accept_version/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/VERSION_CONFLICT/);
    expect(sql).toMatch(/NOT_OWNER/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/'SFM_MIX', 'PENDING'/);
    expect(sql).toMatch(/'SFM_MASTER', 'PENDING'/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.sfm_accept_version[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sfm_accept_version[\s\S]*TO service_role/,
    );
  });

  it("blocks MASTER before MIX SUCCEEDED in start/complete RPCs (V06)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sfm_start_stage/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sfm_complete_stage/);
    expect(sql).toMatch(/ILLEGAL_TRANSITION/);
    expect(sql).toMatch(/p_kind = 'SFM_MASTER'/);
    expect(sql).toMatch(/v_mix_status IS DISTINCT FROM 'SUCCEEDED'/);
  });

  it("does not introduce unapproved render_jobs.kind values (OD-SFM-ID-07)", () => {
    expect(sql).not.toMatch(/ALTER TYPE[\s\S]*render_job/);
    expect(sql).not.toMatch(/INSERT INTO public\.render_jobs/);
    expect(sql).not.toMatch(/UPDATE\s+public\.render_jobs/);
    expect(sql).not.toMatch(/SFM_MIX_PREPARE|SFM_MASTER_BAKE|SFM_QUALITY_ENCODE/);
    // Domain stage kinds exist; render_jobs kind enum is untouched.
    expect(sql).toMatch(/studio_final_stages_kind_chk/);
    expect(sql).toMatch(/Does NOT add render_jobs\.kind values/);
    expect(sql).toMatch(/domain stages ≠ render_jobs/);
  });

  it("sets EXPORTS_ELIGIBLE + current_final only on MASTER SUCCEEDED", () => {
    expect(sql).toMatch(/EXPORTS_ELIGIBLE/);
    expect(sql).toMatch(/interval '90 days'/);
    expect(sql).toMatch(/current_final_version_id = p_version_id/);
    expect(sql).toMatch(/SUPERSEDED/);
  });

  it("maps RPC error tokens for ownership / conflict", () => {
    expect(mapSfmRpcErrorMessage("VERSION_CONFLICT")).toBe("VERSION_CONFLICT");
    expect(mapSfmRpcErrorMessage("NOT_OWNER")).toBe("NOT_OWNER");
    expect(mapSfmRpcErrorMessage("ILLEGAL_TRANSITION")).toBe(
      "ILLEGAL_TRANSITION",
    );
  });
});

describe("SFM Foundation — regression: E3 / TAKE / WAV / Sacred WIP", () => {
  it("does not wire studio_final_stages into E3 MIX / export / worker paths", () => {
    const exportSvc = read(STUDIO_EXPORT_SERVICE);
    const pipeline = read(RENDER_PIPELINE);
    const jobs = read(RENDER_JOB_SERVICE);
    expect(exportSvc).not.toMatch(/studio_final_stages|sfm_accept_version/);
    expect(pipeline).not.toMatch(/studio_final_stages|sfm_complete_stage/);
    expect(jobs).not.toMatch(/studio_final_stages|sfm_accept_version/);
  });

  it("does not modify Sacred WIP recording-eligibility-service", () => {
    const eligibility = read(ELIGIBILITY);
    expect(eligibility).not.toMatch(/studio_final_|sfm_accept|SFM_VERSIONS/);
  });

  it("Accept path does not enqueue STUDIO_EXPORT or claim MIX jobs", () => {
    const service = read(FOUNDATION_SERVICE);
    expect(service).toMatch(/sfm_accept_version/);
    expect(service).not.toMatch(/createStudioExportJob|kind:\s*"MIX"|kind:\s*"STUDIO_EXPORT"/);
    expect(service).not.toMatch(/claim_next_/);
  });
});
