/**
 * GO-SFM-WORKER-ENTRY-FIX-P0 — wiring integration (no remote DB).
 * Proves full claimed job reaches runAlreadyClaimedSfmWorkerJob via default bake.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SfmAlreadyClaimedWorkerJob } from "@/lib/sfm/sfm-worker-core";
import { toSfmAlreadyClaimedWorkerJob } from "@/lib/sfm/sfm-worker-core";

const runAlreadyClaimedSfmWorkerJob = vi.hoisted(() =>
  vi.fn(async (job: SfmAlreadyClaimedWorkerJob) => ({
    outcome: "mix_prepare_ok" as const,
    jobId: job.id,
    kind: "SFM_MIX_PREPARE" as const,
    sourceTakeCount: 1,
    sourceBeatCount: 0,
  })),
);

const claimNextSfmExecutorJobForWorker = vi.hoisted(() =>
  vi.fn(async (): Promise<null | {
    job: SfmAlreadyClaimedWorkerJob & { attempt: number };
  }> => null),
);

vi.mock("@/lib/sfm/sfm-worker-pipeline", () => ({
  runAlreadyClaimedSfmWorkerJob,
}));

vi.mock("@/lib/sfm/sfm-executor-service", () => ({
  claimNextSfmExecutorJobForWorker,
}));

import { createSfmWorkerPoller } from "@/lib/sfm/sfm-worker-poller";

const FULL_JOB: SfmAlreadyClaimedWorkerJob = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "SFM_MIX_PREPARE",
  status: "RUNNING",
  ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  projectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  sfmVersionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  sfmQuality: null,
};

describe("GO-SFM-WORKER-ENTRY-FIX-P0 — job field passthrough", () => {
  beforeEach(() => {
    runAlreadyClaimedSfmWorkerJob.mockClear();
    claimNextSfmExecutorJobForWorker.mockClear();
  });

  it("toSfmAlreadyClaimedWorkerJob keeps required claim fields", () => {
    const input = { ...FULL_JOB, attempt: 2 };
    const mapped = toSfmAlreadyClaimedWorkerJob(input);
    expect(mapped).toEqual({
      id: FULL_JOB.id,
      kind: FULL_JOB.kind,
      status: FULL_JOB.status,
      ownerId: FULL_JOB.ownerId,
      projectId: FULL_JOB.projectId,
      sfmVersionId: FULL_JOB.sfmVersionId,
      sfmQuality: null,
    });
    expect(mapped).not.toHaveProperty("attempt");
  });

  it("default bake wiring passes full job to pipeline (no field strip)", async () => {
    const poller = createSfmWorkerPoller({
      workerRef: "sfm-wire-1",
      claimNext: async () => ({ job: { ...FULL_JOB } }),
      // bake intentionally omitted — exercises default runAlreadyClaimedSfmWorkerJob path
    });

    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "bake_ok",
      jobId: FULL_JOB.id,
      kind: FULL_JOB.kind,
      status: "SUCCEEDED",
    });

    expect(runAlreadyClaimedSfmWorkerJob).toHaveBeenCalledTimes(1);
    const passed = runAlreadyClaimedSfmWorkerJob.mock.calls[0]![0];
    expect(passed).toEqual({
      id: FULL_JOB.id,
      kind: FULL_JOB.kind,
      status: FULL_JOB.status,
      ownerId: FULL_JOB.ownerId,
      projectId: FULL_JOB.projectId,
      sfmVersionId: FULL_JOB.sfmVersionId,
      sfmQuality: FULL_JOB.sfmQuality,
    });
    expect(passed.ownerId).toBe(FULL_JOB.ownerId);
    expect(passed.projectId).toBe(FULL_JOB.projectId);
    expect(passed.sfmVersionId).toBe(FULL_JOB.sfmVersionId);
  });

  it("default claimNext adapter maps claimed record through toSfmAlreadyClaimedWorkerJob", async () => {
    claimNextSfmExecutorJobForWorker.mockResolvedValueOnce({
      job: {
        ...FULL_JOB,
        kind: "SFM_MASTER_BAKE",
        attempt: 1,
      },
    });

    const seen: SfmAlreadyClaimedWorkerJob[] = [];
    const poller = createSfmWorkerPoller({
      workerRef: "sfm-wire-2",
      // claimNext omitted — default adapter
      bake: async (job) => {
        seen.push({ ...job });
        return { status: "SUCCEEDED" };
      },
    });

    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "bake_ok",
      kind: "SFM_MASTER_BAKE",
    });
    expect(claimNextSfmExecutorJobForWorker).toHaveBeenCalledWith("sfm-wire-2");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      id: FULL_JOB.id,
      kind: "SFM_MASTER_BAKE",
      status: FULL_JOB.status,
      ownerId: FULL_JOB.ownerId,
      projectId: FULL_JOB.projectId,
      sfmVersionId: FULL_JOB.sfmVersionId,
      sfmQuality: null,
    });
    expect(seen[0]).not.toHaveProperty("attempt");
  });

  it("wire source has no unsafe Parameters cast and uses explicit job mapper", () => {
    const wire = readFileSync(
      join(process.cwd(), "src/lib/sfm/sfm-worker-poller.ts"),
      "utf8",
    );
    expect(wire).toMatch(/toSfmAlreadyClaimedWorkerJob/);
    expect(wire).toMatch(/runAlreadyClaimedSfmWorkerJob\(job\)/);
    expect(wire).toMatch(/rejectSfmExecutorJobKindForWorker/);
    expect(wire).not.toMatch(
      /as Parameters<typeof runAlreadyClaimedSfmWorkerJob>/,
    );
    expect(wire).not.toMatch(
      /job:\s*\{\s*id:\s*claimed\.job\.id,\s*kind:\s*claimed\.job\.kind,\s*status:\s*claimed\.job\.status,\s*\}/,
    );
  });
});
