/**
 * GO-SFM-WORKER-ENTRY — local unit/contract tests (no remote Supabase / Contabo).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  isSfmWorkerEnabled,
  parseSfmWorkerEnabledFlag,
} from "@/config/audio-render";
import {
  isPollerOutOfScopeKind,
  qualifyStudioExportPollerJob,
} from "@/lib/audio/studio-export-poller-qualify";
import {
  assertSafePollerLogFields,
  formatSafePollerLog,
  redactUnsafeLogText,
} from "@/lib/audio/studio-export-poller-log";
import {
  decideSfmWorkerPollerBootstrap,
  SFM_WORKER_POLLER_DISABLED_EXIT_CODE,
} from "@/lib/sfm/sfm-worker-poller-bootstrap";
import {
  SfmWorkerPollerCore,
  SFM_WORKER_POLLER_SHUTDOWN_GRACE_MS,
  type SfmWorkerPollerJob,
} from "@/lib/sfm/sfm-worker-poller-core";
import { SFM_EXECUTOR_JOB_KINDS } from "@/types/domain";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Minimal RUNNING SFM poller job — includes fields required by pipeline Pick. */
function sfmJob(
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

const SCRIPT = "scripts/sfm-worker-poll.ts";
const WIRE = "src/lib/sfm/sfm-worker-poller.ts";
const CORE = "src/lib/sfm/sfm-worker-poller-core.ts";
const BOOT = "src/lib/sfm/sfm-worker-poller-bootstrap.ts";
const STUDIO_POLLER = "src/lib/audio/studio-export-poller.ts";
const STUDIO_SCRIPT = "scripts/e3-render-worker-poll.ts";
const PKG = "package.json";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";

describe("GO-SFM-WORKER-ENTRY — kill switch / bootstrap", () => {
  it("SFM_WORKER_ENABLED defaults fail-closed (missing/empty/garbage → false)", () => {
    expect(parseSfmWorkerEnabledFlag(undefined)).toBe(false);
    expect(parseSfmWorkerEnabledFlag("")).toBe(false);
    expect(parseSfmWorkerEnabledFlag("maybe")).toBe(false);
    expect(parseSfmWorkerEnabledFlag("false")).toBe(false);
    expect(parseSfmWorkerEnabledFlag("true")).toBe(true);
    expect(isSfmWorkerEnabled(undefined)).toBe(false);
  });

  it("disabled SFM_WORKER_ENABLED → exit_disabled, zero claim path", () => {
    const d = decideSfmWorkerPollerBootstrap({
      sfmWorkerEnabledRaw: undefined,
      sfmVersionsV1Raw: "true",
      workerRefRaw: "sfm-test",
      pollMsRaw: "2000",
      pid: 42,
    });
    expect(d.action).toBe("exit_disabled");
    if (d.action === "exit_disabled") {
      expect(d.errorCode).toBe("SFM_WORKER_ENABLED_OFF");
      expect(d.exitCode).toBe(SFM_WORKER_POLLER_DISABLED_EXIT_CODE);
    }
  });

  it("SFM_VERSIONS_V1 OFF with worker enabled → exit_disabled (no claim)", () => {
    const d = decideSfmWorkerPollerBootstrap({
      sfmWorkerEnabledRaw: "true",
      sfmVersionsV1Raw: "false",
      workerRefRaw: "sfm-test",
      pollMsRaw: "2000",
      pid: 42,
    });
    expect(d.action).toBe("exit_disabled");
    if (d.action === "exit_disabled") {
      expect(d.errorCode).toBe("SFM_VERSIONS_V1_OFF");
    }
  });

  it("both flags ON → run", () => {
    const d = decideSfmWorkerPollerBootstrap({
      sfmWorkerEnabledRaw: "on",
      sfmVersionsV1Raw: "1",
      workerRefRaw: "sfm-a",
      pollMsRaw: "1500",
      pid: 7,
    });
    expect(d).toEqual({
      action: "run",
      workerRef: "sfm-a",
      pollMs: 1500,
      sfmWorkerEnabled: true,
      sfmVersionsV1: true,
    });
  });

  it("invalid pollMs throws (fail-closed before claim)", () => {
    expect(() =>
      decideSfmWorkerPollerBootstrap({
        sfmWorkerEnabledRaw: "true",
        sfmVersionsV1Raw: "true",
        workerRefRaw: "sfm-a",
        pollMsRaw: "50",
        pid: 1,
      }),
    ).toThrow(/SFM_WORKER_POLL_MS/);
  });

  it("defaults workerRef when missing", () => {
    const d = decideSfmWorkerPollerBootstrap({
      sfmWorkerEnabledRaw: "true",
      sfmVersionsV1Raw: "true",
      workerRefRaw: undefined,
      pollMsRaw: undefined,
      pid: 99,
    });
    expect(d.action).toBe("run");
    if (d.action === "run") {
      expect(d.workerRef).toBe("sfm-poller:99");
      expect(d.pollMs).toBe(2000);
    }
  });
});

describe("GO-SFM-WORKER-ENTRY — poller core concurrency / claim / bake / shutdown", () => {
  it("empty queue increments claims_empty", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => null,
      bake: async () => ({ status: "SUCCEEDED" }),
      log: (f) => logs.push(f as unknown as Record<string, unknown>),
    });
    const tick = await poller.runTick();
    expect(tick).toEqual({ outcome: "empty" });
    expect(poller.metrics.claims_empty).toBe(1);
    expect(poller.metrics.claims_ok).toBe(0);
  });

  it("claim error → claim_fail (distinct from bake_fail); no bake", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => {
        throw Object.assign(new Error("rpc down"), { code: "CLAIM_RPC" });
      },
      bake,
    });
    const tick = await poller.runTick();
    expect(tick.outcome).toBe("claim_fail");
    expect(poller.metrics.claims_fail).toBe(1);
    expect(bake).not.toHaveBeenCalled();
  });

  it("only SFM executor kinds bake; MIX rejected as kind_reject", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmJob({ id: "j1", kind: "MIX" }),
      }),
      bake,
    });
    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "kind_reject",
      jobId: "j1",
      kind: "MIX",
    });
    expect(bake).not.toHaveBeenCalled();
    expect(poller.metrics.kind_reject).toBe(1);
  });

  it("bakes all three SFM kinds", async () => {
    for (const kind of SFM_EXECUTOR_JOB_KINDS) {
      const poller = new SfmWorkerPollerCore({
        workerRef: "sfm-1",
        claimNext: async () => ({
          job: sfmJob({ id: `job-${kind}`, kind }),
        }),
        bake: async (job) => {
          expect(job.kind).toBe(kind);
          expect(job.ownerId).toBeTruthy();
          expect(job.projectId).toBeTruthy();
          expect(job.sfmVersionId).toBeTruthy();
          return { status: "SUCCEEDED" };
        },
      });
      const tick = await poller.runTick();
      expect(tick).toMatchObject({
        outcome: "bake_ok",
        jobId: `job-${kind}`,
        kind,
        status: "SUCCEEDED",
      });
    }
  });

  it("bake failure → bake_fail terminal metrics; no auto-requeue hook", async () => {
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmJob({ id: "j-fail", kind: "SFM_MASTER_BAKE" }),
      }),
      bake: async () => {
        throw Object.assign(new Error("qc"), { code: "QC_FAILED" });
      },
    });
    const tick = await poller.runTick();
    expect(tick).toMatchObject({
      outcome: "bake_fail",
      jobId: "j-fail",
      errorCode: "QC_FAILED",
    });
    expect(poller.metrics.bake_fail).toBe(1);
    expect(poller.metrics.bake_ok).toBe(0);
    // Poller logs bake_fail only — no helper that requeues terminal jobs.
    expect(read(CORE)).not.toMatch(/requeueJob|markJobQueued|FAILED_TO_QUEUED/);
  });

  it("concurrency = 1: busy skips second claim", async () => {
    let resolveBake: (() => void) | undefined;
    const bakeGate = new Promise<void>((r) => {
      resolveBake = r;
    });
    let claims = 0;
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => {
        claims += 1;
        return {
          job: sfmJob({ id: `j${claims}`, kind: "SFM_MIX_PREPARE" }),
        };
      },
      bake: async () => {
        await bakeGate;
        return { status: "SUCCEEDED" };
      },
    });
    const started = await poller.runTick({ awaitBake: false });
    expect(started.outcome).toBe("claim_started");
    expect(poller.isBusy()).toBe(true);
    const busy = await poller.runTick({ awaitBake: false });
    expect(busy.outcome).toBe("busy");
    expect(claims).toBe(1);
    expect(poller.metrics.skipped_busy).toBe(1);
    resolveBake!();
    await vi.waitFor(() => expect(poller.isBusy()).toBe(false));
  });

  it("requestStop blocks new claims; does not force-fail in-flight bake", async () => {
    let resolveBake: (() => void) | undefined;
    const bakeGate = new Promise<void>((r) => {
      resolveBake = r;
    });
    const statuses: string[] = [];
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmJob({ id: "j-inflight", kind: "SFM_QUALITY_ENCODE" }),
      }),
      bake: async () => {
        await bakeGate;
        statuses.push("bake_completed");
        return { status: "SUCCEEDED" };
      },
    });
    await poller.runTick({ awaitBake: false });
    poller.requestStop();
    expect(poller.isStopping()).toBe(true);
    const after = await poller.runTick();
    expect(after.outcome).toBe("stopping");
    resolveBake!();
    await vi.waitFor(() => expect(statuses).toContain("bake_completed"));
    expect(poller.metrics.shutdowns).toBe(1);
  });

  it("runUntilStopped exits clean after SIGTERM-style stop with empty queue", async () => {
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      pollMs: 20,
      claimNext: async () => null,
      bake: async () => ({ status: "SUCCEEDED" }),
      sleep: async (ms) => {
        await new Promise((r) => setTimeout(r, Math.min(ms, 5)));
      },
    });
    const run = poller.runUntilStopped();
    await new Promise((r) => setTimeout(r, 30));
    poller.requestStop();
    await expect(run).resolves.toBe(0);
  });

  it("shutdown grace constant is ≥ 180s class", () => {
    expect(SFM_WORKER_POLLER_SHUTDOWN_GRACE_MS).toBeGreaterThanOrEqual(
      180_000,
    );
  });
});

describe("GO-SFM-WORKER-ENTRY — safe logging", () => {
  it("allows allowlisted fields and redacts URL-like text", () => {
    expect(() =>
      assertSafePollerLogFields({
        event: "claim_ok",
        jobId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        kind: "SFM_MIX_PREPARE",
        workerRef: "sfm-1",
      }),
    ).not.toThrow();
    expect(
      formatSafePollerLog({
        event: "bake_fail",
        errorCode: "QC_FAILED",
        workerRef: "sfm-1",
      }),
    ).toMatch(/QC_FAILED/);
    expect(
      redactUnsafeLogText("boom https://signed.example/path?token=abc"),
    ).toBe("[REDACTED]");
  });
});

describe("GO-SFM-WORKER-ENTRY — STUDIO isolation contracts", () => {
  it("STUDIO poller still KIND_OUT for all SFM executor kinds", () => {
    for (const kind of SFM_EXECUTOR_JOB_KINDS) {
      expect(
        qualifyStudioExportPollerJob({
          kind,
          status: "QUEUED",
          requestedTier: "WAV",
          projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          mixSessionId: null,
          takeId: null,
          attempt: 1,
        }),
      ).toEqual({ eligible: false, reason: "KIND_OUT" });
      expect(isPollerOutOfScopeKind(kind)).toBe(true);
    }
  });

  it("STUDIO poller/script do not wire SFM claim or bake", () => {
    const studio = read(STUDIO_POLLER);
    const studioScript = read(STUDIO_SCRIPT);
    expect(studio).not.toMatch(/claim_next_sfm_job|claimNextSfm|sfm-worker-pipeline|createSfmWorkerPoller/);
    expect(studioScript).not.toMatch(/claim_next_sfm_job|sfm-worker-poll|SFM_WORKER_ENABLED/);
    expect(studioScript).toMatch(/kindAllowlist: \["STUDIO_EXPORT"\]/);
  });

  it("SFM wire uses claimNextSfmExecutorJobForWorker + runAlreadyClaimedSfmWorkerJob", () => {
    const wire = read(WIRE);
    expect(wire).toMatch(/claimNextSfmExecutorJobForWorker/);
    expect(wire).toMatch(/runAlreadyClaimedSfmWorkerJob/);
    expect(wire).toMatch(/toSfmAlreadyClaimedWorkerJob/);
    expect(wire).not.toMatch(
      /as Parameters<typeof runAlreadyClaimedSfmWorkerJob>/,
    );
    expect(wire).not.toMatch(/claimNextStudioExportAsWorker|claim_next_studio_export/);
  });

  it("kind_reject still leaves RUNNING (P1 unchanged — no markFailed/requeue)", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const poller = new SfmWorkerPollerCore({
      workerRef: "sfm-1",
      claimNext: async () => ({
        job: sfmJob({ id: "j-reject", kind: "STUDIO_EXPORT" }),
      }),
      bake,
    });
    const tick = await poller.runTick();
    expect(tick.outcome).toBe("kind_reject");
    expect(bake).not.toHaveBeenCalled();
    expect(read(CORE)).toMatch(/Job remains as claimed by RPC/);
    expect(read(CORE)).not.toMatch(/markJobFailed|requeueJob/);
  });

  it("script + npm entry exist; Sacred WIP untouched", () => {
    const script = read(SCRIPT);
    const pkg = read(PKG);
    expect(script).toMatch(/decideSfmWorkerPollerBootstrap/);
    expect(script).toMatch(/createSfmWorkerPoller/);
    expect(script).toMatch(/SFM_WORKER_ENABLED/);
    expect(script).toMatch(/SIGTERM|SIGINT/);
    expect(script).toMatch(/SFM_MIX_PREPARE/);
    expect(pkg).toMatch(/"sfm:worker:poll"/);
    expect(read(BOOT)).toMatch(/SFM_WORKER_ENABLED_OFF/);
    expect(read(ELIGIBILITY).length).toBeGreaterThan(0);
    expect(script).not.toMatch(/recording-eligibility-service/);
  });
});
