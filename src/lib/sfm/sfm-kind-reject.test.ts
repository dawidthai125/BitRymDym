/**
 * OD-SFM-WORKER-KIND-REJECT — local contract tests (no remote DB / Contabo).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  decideSfmStartWithBoundJob,
  isTerminalBoundJobWithoutAutoRetry,
} from "@/lib/sfm/sfm-executor-stage-guards";
import {
  SfmWorkerPollerCore,
  type SfmWorkerPollerJob,
} from "@/lib/sfm/sfm-worker-poller-core";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261016040822_sfm_reject_executor_job_kind.sql";
const SERVICE = "src/lib/audio/render-job-service.ts";
const EXEC = "src/lib/sfm/sfm-executor-service.ts";
const WIRE = "src/lib/sfm/sfm-worker-poller.ts";
const CORE = "src/lib/sfm/sfm-worker-poller-core.ts";
const STUDIO_POLLER = "src/lib/audio/studio-export-poller.ts";
const OPEN = "docs/decisions/OPEN_DECISIONS.md";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sfmShapedJob(
  overrides: Partial<SfmWorkerPollerJob> &
    Pick<SfmWorkerPollerJob, "id" | "kind">,
): SfmWorkerPollerJob {
  return {
    status: "RUNNING",
    ownerId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    sfmVersionId: "33333333-3333-4333-8333-333333333333",
    sfmQuality: null,
    ...overrides,
  };
}

describe("OD-SFM-WORKER-KIND-REJECT — RPC migration contract", () => {
  const sql = read(MIGRATION);

  it("defines reject_sfm_executor_job_kind SECURITY DEFINER + service_role only", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.reject_sfm_executor_job_kind/,
    );
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(
      /Only service_role may reject_sfm_executor_job_kind/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.reject_sfm_executor_job_kind\(uuid, text\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.reject_sfm_executor_job_kind\(uuid, text\) FROM anon/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.reject_sfm_executor_job_kind\(uuid, text\) FROM authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reject_sfm_executor_job_kind\(uuid, text\) TO service_role/,
    );
  });

  it("CAS requires RUNNING + worker_ref + SFM claim shape; sets FAILED/KIND_OUT", () => {
    expect(sql).toMatch(/status = 'FAILED'/);
    expect(sql).toMatch(/error_code = 'KIND_OUT'/);
    expect(sql).toMatch(/finished_at = v_finished_at/);
    expect(sql).toMatch(/rj\.status = 'RUNNING'/);
    expect(sql).toMatch(/rj\.worker_ref IS NOT DISTINCT FROM v_ref/);
    expect(sql).toMatch(/rj\.sfm_version_id IS NOT NULL/);
    expect(sql).toMatch(/rj\.project_id IS NOT NULL/);
    expect(sql).toMatch(/rj\.mix_session_id IS NULL/);
    expect(sql).toMatch(/rj\.take_id IS NULL/);
    expect(sql).not.toMatch(/FAILED_TO_QUEUED|status = 'QUEUED'/);
    expect(sql).toMatch(/No bake, no FAILED→QUEUED/);
  });

  it("does not mutate stages or create artifacts", () => {
    expect(sql).not.toMatch(/studio_final_stages|sfm_complete_stage|audio_artifacts|sfm_promote/);
  });
});

describe("OD-SFM-WORKER-KIND-REJECT — service wiring contracts", () => {
  it("render-job-service exposes rejectSfmExecutorJobKindOut via RPC", () => {
    const service = read(SERVICE);
    expect(service).toMatch(/reject_sfm_executor_job_kind/);
    expect(service).toMatch(/rejectSfmExecutorJobKindOut/);
    expect(service).toMatch(/outcome: "cas_miss"/);
    expect(service).toMatch(/errorCode: "KIND_OUT"/);
    expect(service).not.toMatch(
      /reject_sfm_executor_job_kind[\s\S]{0,200}markJobFailed/,
    );
  });

  it("executor service re-exports worker reject entry", () => {
    const exec = read(EXEC);
    expect(exec).toMatch(/rejectSfmExecutorJobKindForWorker/);
    expect(exec).toMatch(/rejectSfmExecutorJobKindOut/);
  });

  it("SFM wire uses reject RPC; STUDIO poller does not", () => {
    const wire = read(WIRE);
    const studio = read(STUDIO_POLLER);
    expect(wire).toMatch(/rejectSfmExecutorJobKindForWorker/);
    expect(wire).toMatch(/rejectUnsupportedKind/);
    expect(wire).toMatch(/no alternate status mutation/);
    expect(wire).not.toMatch(/\.markJobFailed\(|defaultMarkFailed/);
    expect(studio).not.toMatch(
      /reject_sfm_executor_job_kind|rejectSfmExecutorJobKind/,
    );
  });
});

describe("OD-SFM-WORKER-KIND-REJECT — poller behavior", () => {
  it("unsupported kind calls reject RPC and does not bake", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const rejectUnsupportedKind = vi.fn(async () => "rejected" as const);
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmShapedJob({ id: "j-out", kind: "MIX" }),
      }),
      bake,
      rejectUnsupportedKind,
    });
    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "kind_reject",
      jobId: "j-out",
      kind: "MIX",
      rejectResult: "rejected",
    });
    expect(rejectUnsupportedKind).toHaveBeenCalledTimes(1);
    expect(rejectUnsupportedKind).toHaveBeenCalledWith(
      expect.objectContaining({ id: "j-out", kind: "MIX" }),
      "sfm-1",
    );
    expect(bake).not.toHaveBeenCalled();
    expect(poller.metrics.kind_reject_rpc_ok).toBe(1);
    expect(poller.metrics.kind_reject_cas_miss).toBe(0);
  });

  it("CAS miss is not logged as success; no bake; no second mutation", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const rejectUnsupportedKind = vi.fn(async () => "cas_miss" as const);
    const logs: Array<Record<string, unknown>> = [];
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmShapedJob({ id: "j-miss", kind: "STUDIO_EXPORT" }),
      }),
      bake,
      rejectUnsupportedKind,
      log: (f) => logs.push(f as unknown as Record<string, unknown>),
    });
    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "kind_reject",
      rejectResult: "cas_miss",
    });
    expect(bake).not.toHaveBeenCalled();
    expect(poller.metrics.kind_reject_cas_miss).toBe(1);
    expect(poller.metrics.kind_reject_rpc_ok).toBe(0);
    expect(logs.some((l) => l.event === "kind_reject_ok")).toBe(false);
    expect(logs.some((l) => l.event === "kind_reject_cas_miss")).toBe(true);
    expect(read(CORE)).not.toMatch(/markJobFailed|requeueJob|FAILED_TO_QUEUED/);
  });

  it("RPC failure does not fallback to markJobFailed or requeue", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const rejectUnsupportedKind = vi.fn(async () => {
      throw new Error("rpc down");
    });
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmShapedJob({ id: "j-fail", kind: "TAKE_EXPORT" }),
      }),
      bake,
      rejectUnsupportedKind,
    });
    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "kind_reject",
      rejectResult: "rpc_fail",
    });
    expect(bake).not.toHaveBeenCalled();
    expect(poller.metrics.kind_reject_rpc_fail).toBe(1);
    expect(rejectUnsupportedKind).toHaveBeenCalledTimes(1);
  });

  it("valid SFM kinds still bake and do not call reject", async () => {
    const rejectUnsupportedKind = vi.fn(async () => "rejected" as const);
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmShapedJob({
          id: "j-ok",
          kind: "SFM_MIX_PREPARE",
        }),
      }),
      bake: async () => ({ status: "SUCCEEDED" }),
      rejectUnsupportedKind,
    });
    const tick = await poller.runTick();
    expect(tick.outcome).toBe("bake_ok");
    expect(rejectUnsupportedKind).not.toHaveBeenCalled();
  });
});

describe("OD-SFM-WORKER-KIND-REJECT — stage RECOVERY_REQUIRED", () => {
  it("FAILED bound job yields RECOVERY_REQUIRED without auto-retry", () => {
    expect(
      decideSfmStartWithBoundJob({
        stageStatus: "RUNNING",
        stageJobId: "job-1",
        boundJobStatus: "FAILED",
      }),
    ).toEqual({
      outcome: "RECOVERY_REQUIRED",
      mutatesStage: false,
      code: "RECOVERY_REQUIRED",
    });
    expect(isTerminalBoundJobWithoutAutoRetry("FAILED")).toBe(true);
  });
});

describe("OD-SFM-WORKER-KIND-REJECT — SSOT decision present", () => {
  it("OPEN_DECISIONS records OD-SFM-WORKER-KIND-REJECT and orphan OD open", () => {
    const open = read(OPEN);
    expect(open).toMatch(/OD-SFM-WORKER-KIND-REJECT/);
    expect(open).toMatch(/KIND_OUT/);
    expect(open).toMatch(/OD-SFM-WORKER-ORPHAN-TIMEOUT/);
  });
});
