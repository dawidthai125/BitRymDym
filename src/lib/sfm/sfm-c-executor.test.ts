/**
 * SFM Stage C — executor kinds, XOR, mapJobKind fail-closed, claim isolation.
 * Live Postgres/RLS/concurrency = UNVERIFIED without Docker/local Supabase.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isRenderJobKind,
  isSfmExecutorJobKind,
  isValidRenderJobSourceXor,
  mapJobKind,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import {
  isPollerOutOfScopeKind,
  qualifyStudioExportPollerJob,
} from "@/lib/audio/studio-export-poller-qualify";
import {
  assertCanStartSfmStage,
  SFM_STAGE_KINDS,
} from "@/lib/sfm/sfm-domain";
import {
  executorKindForSfmStage,
  jobSucceededImpliesStageComplete,
  stageKindForSfmExecutor,
} from "@/lib/sfm/sfm-executor-kinds";
import {
  decideSfmCompleteJobBind,
  decideSfmStartWithBoundJob,
  isTerminalBoundJobWithoutAutoRetry,
} from "@/lib/sfm/sfm-executor-stage-guards";
import { mapSfmRpcErrorMessage } from "@/lib/sfm/sfm-domain";
import {
  RENDER_JOB_KINDS,
  SFM_EXECUTOR_JOB_KINDS,
} from "@/types/domain";

const MIGRATION_C =
  "supabase/migrations/20261015073145_sfm_c_executor_jobs.sql";
const MIGRATION_STUDIO_CLAIM =
  "supabase/migrations/20261013183721_claim_next_studio_export_job.sql";
const MIGRATION_A =
  "supabase/migrations/20261015072911_sfm_foundation_versions_stages.sql";
const RENDER_JOB_SERVICE = "src/lib/audio/render-job-service.ts";
const RENDER_PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const POLLER = "src/lib/audio/studio-export-poller.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";

const MIX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VERSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OWNER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JOB_A = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const JOB_B = "11111111-1111-4111-8111-111111111111";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SFM Stage C — kinds SSOT (OD-SFM-ID-07)", () => {
  it("exposes three SFM executor kinds distinct from domain stages", () => {
    expect(SFM_EXECUTOR_JOB_KINDS).toEqual([
      "SFM_MIX_PREPARE",
      "SFM_MASTER_BAKE",
      "SFM_QUALITY_ENCODE",
    ]);
    expect(SFM_STAGE_KINDS).toEqual(["SFM_MIX", "SFM_MASTER"]);
    expect(RENDER_JOB_KINDS).toContain("SFM_MIX_PREPARE");
    expect(RENDER_JOB_KINDS).toContain("SFM_MASTER_BAKE");
    expect(RENDER_JOB_KINDS).toContain("SFM_QUALITY_ENCODE");
    expect(RENDER_JOB_KINDS).toContain("MIX");
    expect(RENDER_JOB_KINDS).toContain("STUDIO_EXPORT");
    expect(isRenderJobKind("SFM_MIX_PREPARE")).toBe(true);
    expect(isRenderJobKind("SFM_MIX")).toBe(false);
    expect(isSfmExecutorJobKind("MIX")).toBe(false);
  });

  it("maps domain stages to executor kinds (not identity)", () => {
    expect(executorKindForSfmStage("SFM_MIX")).toBe("SFM_MIX_PREPARE");
    expect(executorKindForSfmStage("SFM_MASTER")).toBe("SFM_MASTER_BAKE");
    expect(stageKindForSfmExecutor("SFM_MIX_PREPARE")).toBe("SFM_MIX");
    expect(stageKindForSfmExecutor("SFM_MASTER_BAKE")).toBe("SFM_MASTER");
    expect(stageKindForSfmExecutor("SFM_QUALITY_ENCODE")).toBeNull();
    expect(jobSucceededImpliesStageComplete()).toBe(false);
  });
});

describe("SFM Stage C — mapJobKind fail-closed (no unknown→MIX)", () => {
  it("maps known kinds including SFM executors", () => {
    expect(mapJobKind("MIX")).toBe("MIX");
    expect(mapJobKind("TAKE_EXPORT")).toBe("TAKE_EXPORT");
    expect(mapJobKind("STUDIO_EXPORT")).toBe("STUDIO_EXPORT");
    expect(mapJobKind("SFM_MIX_PREPARE")).toBe("SFM_MIX_PREPARE");
    expect(mapJobKind("SFM_MASTER_BAKE")).toBe("SFM_MASTER_BAKE");
    expect(mapJobKind("SFM_QUALITY_ENCODE")).toBe("SFM_QUALITY_ENCODE");
  });

  it("throws INVALID for unknown / null kinds (never MIX)", () => {
    expect(() => mapJobKind("WEIRD")).toThrow(RenderJobDomainError);
    expect(() => mapJobKind(null)).toThrow(/Unsupported render job kind/);
    expect(() => mapJobKind(undefined)).toThrow(RenderJobDomainError);
    expect(() => mapJobKind("SFM_MIX")).toThrow(RenderJobDomainError);
    try {
      mapJobKind("GARBAGE");
    } catch (e) {
      expect(e).toBeInstanceOf(RenderJobDomainError);
      expect((e as RenderJobDomainError).code).toBe("INVALID");
      expect((e as Error).message).not.toMatch(/^MIX$/);
    }
  });

  it("pipeline getJobRecord / service use shared mapJobKind (source)", () => {
    const service = read(RENDER_JOB_SERVICE);
    const pipeline = read(RENDER_PIPELINE);
    expect(service).toMatch(/mapJobKind/);
    expect(service).not.toMatch(/return \"MIX\";\s*\n\s*\}/);
    expect(pipeline).toMatch(/mapJobKind\(data\.kind/);
    expect(pipeline).not.toMatch(
      /kindRaw === \"STUDIO_EXPORT\"\s*\?\s*\"STUDIO_EXPORT\"\s*:\s*\"MIX\"/,
    );
  });
});

describe("SFM Stage C — source XOR / version bind (TS mirror)", () => {
  it("accepts SFM_MIX_PREPARE / SFM_MASTER_BAKE with version+project only", () => {
    for (const kind of ["SFM_MIX_PREPARE", "SFM_MASTER_BAKE"] as const) {
      expect(
        isValidRenderJobSourceXor({
          kind,
          mixSessionId: null,
          takeId: null,
          projectId: PROJECT_ID,
          sfmVersionId: VERSION_ID,
          sfmQuality: null,
        }),
      ).toBe(true);
    }
  });

  it("requires sfm_quality for SFM_QUALITY_ENCODE", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "SFM_QUALITY_ENCODE",
        mixSessionId: null,
        takeId: null,
        projectId: PROJECT_ID,
        sfmVersionId: VERSION_ID,
        sfmQuality: null,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "SFM_QUALITY_ENCODE",
        mixSessionId: null,
        takeId: null,
        projectId: PROJECT_ID,
        sfmVersionId: VERSION_ID,
        sfmQuality: "MP3_192",
      }),
    ).toBe(true);
  });

  it("rejects owner-mismatch-shaped XOR (mix/take on SFM; version on MIX)", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "SFM_MIX_PREPARE",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: PROJECT_ID,
        sfmVersionId: VERSION_ID,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "SFM_MASTER_BAKE",
        mixSessionId: null,
        takeId: TAKE_ID,
        projectId: PROJECT_ID,
        sfmVersionId: VERSION_ID,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: null,
        sfmVersionId: VERSION_ID,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: null,
        takeId: null,
        projectId: PROJECT_ID,
        sfmVersionId: VERSION_ID,
      }),
    ).toBe(false);
  });

  it("preserves MIX / TAKE / STUDIO_EXPORT XOR", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: null,
      }),
    ).toBe(true);
    expect(
      isValidRenderJobSourceXor({
        kind: "TAKE_EXPORT",
        mixSessionId: null,
        takeId: TAKE_ID,
        projectId: null,
      }),
    ).toBe(true);
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: null,
        takeId: null,
        projectId: PROJECT_ID,
      }),
    ).toBe(true);
  });
});

describe("SFM Stage C — stage order + complete contract (pure)", () => {
  it("denies MASTER start before MIX SUCCEEDED", () => {
    expect(() =>
      assertCanStartSfmStage({
        kind: "SFM_MASTER",
        mixStatus: "PENDING",
        currentStatus: "PENDING",
      }),
    ).toThrow(/ILLEGAL_TRANSITION|SFM_MASTER/);
  });

  it("documents job SUCCEEDED ≠ stage complete", () => {
    expect(jobSucceededImpliesStageComplete()).toBe(false);
    const sql = read(MIGRATION_C);
    expect(sql).toMatch(/Job SUCCEEDED alone never completes/);
    expect(sql).toMatch(/v_job\.status IS DISTINCT FROM 'SUCCEEDED'/);
    expect(sql).toMatch(/sfm_complete_stage/);
  });
});

describe("SFM Stage C — migration / claim RPC contracts", () => {
  const sql = read(MIGRATION_C);

  it("expands kind CHECK with three SFM kinds", () => {
    expect(sql).toMatch(/SFM_MIX_PREPARE/);
    expect(sql).toMatch(/SFM_MASTER_BAKE/);
    expect(sql).toMatch(/SFM_QUALITY_ENCODE/);
    expect(sql).toMatch(/render_jobs_kind_chk/);
    expect(sql).toMatch(/sfm_version_id/);
  });

  it("defines claim_next_sfm_job SFM-only with SKIP LOCKED + service_role", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_next_sfm_job/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(
      /kind IN \('SFM_MIX_PREPARE', 'SFM_MASTER_BAKE', 'SFM_QUALITY_ENCODE'\)/,
    );
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_next_sfm_job/);
    expect(sql).toMatch(/TO service_role/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_next_sfm_job[\s\S]*FROM anon/,
    );
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/No auto-retry/);
    expect(sql).not.toMatch(/status\s*=\s*'QUEUED'[\s\S]{0,80}FROM\s+.*FAILED/);
    expect(sql).not.toMatch(/UPDATE[\s\S]{0,120}status\s*=\s*'QUEUED'[\s\S]{0,80}FAILED/);
  });

  it("does not widen claim_next_studio_export_job", () => {
    const studioClaim = read(MIGRATION_STUDIO_CLAIM);
    expect(studioClaim).toMatch(/kind = 'STUDIO_EXPORT'/);
    expect(studioClaim).not.toMatch(/SFM_MIX_PREPARE/);
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.claim_next_studio_export_job/,
    );
  });

  it("start_stage enqueues prepare/bake; complete validates job bind", () => {
    expect(sql).toMatch(/INSERT INTO public\.render_jobs/);
    expect(sql).toMatch(/SFM_MIX_PREPARE/);
    expect(sql).toMatch(/SFM_MASTER_BAKE/);
    expect(sql).toMatch(/sfm_enqueue_quality_encode/);
    expect(sql).toMatch(/v_job\.sfm_version_id IS DISTINCT FROM p_version_id/);
    expect(sql).toMatch(/v_job\.owner_id IS DISTINCT FROM v_version\.owner_id/);
  });

  it("keeps domain stage kinds only SFM_MIX/SFM_MASTER in Stage A migration", () => {
    const a = read(MIGRATION_A);
    expect(a).toMatch(/CHECK \(kind IN \('SFM_MIX', 'SFM_MASTER'\)\)/);
  });

  it("service rejects SFM on claim-by-id MIX path", () => {
    const service = read(RENDER_JOB_SERVICE);
    expect(service).toMatch(/claim_next_sfm_job/);
    expect(service).toMatch(/claimNextSfmJobAsWorker/);
    expect(service).toMatch(/isSfmExecutorJobKind/);
    expect(service).toMatch(
      /SFM executor jobs must use claim_next_sfm_job/,
    );
  });
});

describe("SFM Stage C — Contabo / E3 / TAKE / Sacred WIP isolation", () => {
  it("poller qualification rejects all SFM kinds", () => {
    for (const kind of SFM_EXECUTOR_JOB_KINDS) {
      expect(
        qualifyStudioExportPollerJob({
          kind,
          status: "QUEUED",
          requestedTier: "WAV",
          projectId: PROJECT_ID,
          mixSessionId: null,
          takeId: null,
          attempt: 1,
        }),
      ).toEqual({ eligible: false, reason: "KIND_OUT" });
      expect(isPollerOutOfScopeKind(kind)).toBe(true);
    }
  });

  it("does not wire SFM claim into STUDIO poller module", () => {
    const poller = read(POLLER);
    expect(poller).not.toMatch(/claim_next_sfm_job|claimNextSfmJob/);
    expect(poller).not.toMatch(/runAlreadyClaimedSfmWorkerJob|sfm-worker-pipeline/);
    expect(poller).toMatch(/claimNextStudioExportAsWorker|STUDIO_EXPORT/);
  });

  it("keeps SFM bake in dedicated sfm-worker-pipeline (not Contabo)", () => {
    const sfmPipeline = read("src/lib/sfm/sfm-worker-pipeline.ts");
    const pipeline = read(RENDER_PIPELINE);
    expect(sfmPipeline).toMatch(/runAlreadyClaimedSfmWorkerJob/);
    expect(sfmPipeline).toMatch(/SFM_MIX_PREPARE|SFM_MASTER_BAKE|SFM_QUALITY_ENCODE/);
    expect(pipeline).not.toMatch(/from \"@\/lib\/sfm\/sfm-worker/);
    expect(pipeline).toMatch(/claim_next_sfm_job|dedicated SFM worker/);
  });

  it("does not modify Sacred WIP recording-eligibility-service", () => {
    const eligibility = read(ELIGIBILITY);
    expect(eligibility).not.toMatch(/sfm_version_id|SFM_MIX_PREPARE|claim_next_sfm/);
  });

  it("dispatcher remains fail-closed for non-MIX after claim", () => {
    const pipeline = read(RENDER_PIPELINE);
    expect(pipeline).toMatch(/Unsupported render job kind/);
    expect(pipeline).toMatch(/job\.kind !== \"MIX\"/);
  });
});

describe("SFM Stage C hardening — F-01 complete stage↔job bind", () => {
  const baseJob = {
    id: JOB_A,
    ownerId: OWNER_ID,
    sfmVersionId: VERSION_ID,
    kind: "SFM_MIX_PREPARE",
    status: "SUCCEEDED",
  };

  it("SUCCEEDED with p_job_id === stage.job_id is ALLOW", () => {
    const d = decideSfmCompleteJobBind({
      stageStatus: "RUNNING",
      stageKind: "SFM_MIX",
      stageJobId: JOB_A,
      pJobId: JOB_A,
      pStatus: "SUCCEEDED",
      versionId: VERSION_ID,
      versionOwnerId: OWNER_ID,
      job: baseJob,
    });
    expect(d).toEqual({
      outcome: "ALLOW",
      mutatesStage: true,
      bindJobId: JOB_A,
    });
  });

  it("SUCCEEDED with different p_job_id is DENY CONFLICT (no stage mutate)", () => {
    const d = decideSfmCompleteJobBind({
      stageStatus: "RUNNING",
      stageKind: "SFM_MIX",
      stageJobId: JOB_A,
      pJobId: JOB_B,
      pStatus: "SUCCEEDED",
      versionId: VERSION_ID,
      versionOwnerId: OWNER_ID,
      job: { ...baseJob, id: JOB_B },
    });
    expect(d).toEqual({
      outcome: "DENY",
      mutatesStage: false,
      code: "CONFLICT",
    });
  });

  it("SUCCEEDED without stage.job_id is DENY INVALID", () => {
    const d = decideSfmCompleteJobBind({
      stageStatus: "RUNNING",
      stageKind: "SFM_MIX",
      stageJobId: null,
      pJobId: JOB_A,
      pStatus: "SUCCEEDED",
      versionId: VERSION_ID,
      versionOwnerId: OWNER_ID,
      job: baseJob,
    });
    expect(d).toEqual({
      outcome: "DENY",
      mutatesStage: false,
      code: "INVALID",
    });
  });

  it("DENIED for other version or other owner", () => {
    expect(
      decideSfmCompleteJobBind({
        stageStatus: "RUNNING",
        stageKind: "SFM_MIX",
        stageJobId: JOB_A,
        pJobId: null,
        pStatus: "SUCCEEDED",
        versionId: VERSION_ID,
        versionOwnerId: OWNER_ID,
        job: { ...baseJob, sfmVersionId: PROJECT_ID },
      }),
    ).toMatchObject({ outcome: "DENY", code: "NOT_ELIGIBLE", mutatesStage: false });

    expect(
      decideSfmCompleteJobBind({
        stageStatus: "RUNNING",
        stageKind: "SFM_MIX",
        stageJobId: JOB_A,
        pJobId: null,
        pStatus: "SUCCEEDED",
        versionId: VERSION_ID,
        versionOwnerId: OWNER_ID,
        job: { ...baseJob, ownerId: PROJECT_ID },
      }),
    ).toMatchObject({ outcome: "DENY", code: "NOT_OWNER", mutatesStage: false });
  });

  it("wrong kind DENY on SUCCEEDED and FAILED paths", () => {
    const wrong = { ...baseJob, kind: "SFM_QUALITY_ENCODE" };
    expect(
      decideSfmCompleteJobBind({
        stageStatus: "RUNNING",
        stageKind: "SFM_MIX",
        stageJobId: JOB_A,
        pJobId: JOB_A,
        pStatus: "SUCCEEDED",
        versionId: VERSION_ID,
        versionOwnerId: OWNER_ID,
        job: wrong,
      }),
    ).toMatchObject({ outcome: "DENY", code: "INVALID", mutatesStage: false });

    expect(
      decideSfmCompleteJobBind({
        stageStatus: "RUNNING",
        stageKind: "SFM_MIX",
        stageJobId: JOB_A,
        pJobId: JOB_A,
        pStatus: "FAILED",
        versionId: VERSION_ID,
        versionOwnerId: OWNER_ID,
        job: wrong,
      }),
    ).toMatchObject({ outcome: "DENY", code: "INVALID", mutatesStage: false });
  });

  it("idempotent correct complete does not re-mutate", () => {
    const d = decideSfmCompleteJobBind({
      stageStatus: "SUCCEEDED",
      stageKind: "SFM_MIX",
      stageJobId: JOB_A,
      pJobId: JOB_A,
      pStatus: "SUCCEEDED",
      versionId: VERSION_ID,
      versionOwnerId: OWNER_ID,
      job: baseJob,
    });
    expect(d).toEqual({ outcome: "IDEMPOTENT_RETURN", mutatesStage: false });
  });

  it("SQL enforces stage.job_id + p_job_id match + no soft FAILED kind", () => {
    const sql = read(MIGRATION_C);
    expect(sql).toMatch(/p_job_id IS DISTINCT FROM v_stage\.job_id/);
    expect(sql).toMatch(/RAISE EXCEPTION 'CONFLICT'/);
    expect(sql).toMatch(
      /IF v_stage\.job_id IS NULL THEN\s+RAISE EXCEPTION 'INVALID'/,
    );
    expect(sql).toMatch(/v_bind_job := v_stage\.job_id/);
    expect(sql).not.toMatch(/kind match soft/);
    // FAILED path requires expected kind (same predicate as SUCCEEDED)
    expect(sql).toMatch(
      /FAILED path: optional bind; owner\/version\/kind must match stage contract \(F-03\)/,
    );
    expect(sql).toMatch(
      /ELSIF v_bind_job IS NOT NULL THEN[\s\S]*v_job\.kind IS DISTINCT FROM v_expected_job_kind/,
    );
  });
});

describe("SFM Stage C hardening — F-02 start terminal bound job", () => {
  it("QUEUED / RUNNING bound job => idempotent return (no duplicate job)", () => {
    for (const status of ["QUEUED", "RUNNING"] as const) {
      const d = decideSfmStartWithBoundJob({
        stageStatus: "RUNNING",
        stageJobId: JOB_A,
        boundJobStatus: status,
      });
      expect(d).toEqual({
        outcome: "IDEMPOTENT_RETURN",
        mutatesStage: false,
      });
    }
  });

  it("FAILED / TIMEOUT / CANCELLED => RECOVERY_REQUIRED without stage mutate", () => {
    for (const status of ["FAILED", "TIMEOUT", "CANCELLED"] as const) {
      expect(isTerminalBoundJobWithoutAutoRetry(status)).toBe(true);
      const d = decideSfmStartWithBoundJob({
        stageStatus: "RUNNING",
        stageJobId: JOB_A,
        boundJobStatus: status,
      });
      expect(d).toEqual({
        outcome: "RECOVERY_REQUIRED",
        mutatesStage: false,
        code: "RECOVERY_REQUIRED",
      });
    }
  });

  it("SUCCEEDED job while stage RUNNING => RECOVERY_REQUIRED (complete via RPC)", () => {
    const d = decideSfmStartWithBoundJob({
      stageStatus: "RUNNING",
      stageJobId: JOB_A,
      boundJobStatus: "SUCCEEDED",
    });
    expect(d).toEqual({
      outcome: "RECOVERY_REQUIRED",
      mutatesStage: false,
      code: "RECOVERY_REQUIRED",
    });
  });

  it("maps RECOVERY_REQUIRED RPC token and SQL raises it (no auto-retry)", () => {
    expect(mapSfmRpcErrorMessage("RECOVERY_REQUIRED")).toBe("RECOVERY_REQUIRED");
    const sql = read(MIGRATION_C);
    expect(sql).toMatch(/RAISE EXCEPTION 'RECOVERY_REQUIRED'/);
    expect(sql).toMatch(/v_job_status IN \('QUEUED', 'RUNNING'\)/);
    expect(sql).toMatch(/Does NOT auto-retry, re-queue, create a new job/);
    expect(sql).not.toMatch(
      /status\s*=\s*'QUEUED'[\s\S]{0,80}FROM\s+.*FAILED/,
    );
  });
});

describe("SFM Stage C hardening — B1 / Foundation / E3 / TAKE / STUDIO regression", () => {
  it("preserves MIX/TAKE/STUDIO XOR and poller STUDIO-only claim", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: null,
      }),
    ).toBe(true);
    expect(
      isValidRenderJobSourceXor({
        kind: "TAKE_EXPORT",
        mixSessionId: null,
        takeId: TAKE_ID,
        projectId: null,
      }),
    ).toBe(true);
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: null,
        takeId: null,
        projectId: PROJECT_ID,
      }),
    ).toBe(true);

    const studioClaim = read(MIGRATION_STUDIO_CLAIM);
    expect(studioClaim).toMatch(/kind = 'STUDIO_EXPORT'/);
    expect(studioClaim).not.toMatch(/SFM_MIX_PREPARE/);

    const poller = read(POLLER);
    expect(poller).not.toMatch(/claim_next_sfm_job|claimNextSfmJob/);
  });

  it("foundation stage kinds unchanged; domain stages ≠ executor kinds", () => {
    const a = read(MIGRATION_A);
    expect(a).toMatch(/CHECK \(kind IN \('SFM_MIX', 'SFM_MASTER'\)\)/);
    expect(SFM_STAGE_KINDS).toEqual(["SFM_MIX", "SFM_MASTER"]);
    expect(executorKindForSfmStage("SFM_MIX")).toBe("SFM_MIX_PREPARE");
    expect(jobSucceededImpliesStageComplete()).toBe(false);
  });
});
