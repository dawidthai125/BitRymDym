/**
 * GO-IMPL-CONTABO-POLL — local unit/contract tests (no prod Supabase / Contabo).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AUDIO_RENDER_JOB_TIMEOUT_SECONDS } from "@/config/audio-render";
import {
  StudioExportPollerCore,
  STUDIO_EXPORT_POLLER_SHUTDOWN_GRACE_MS,
} from "@/lib/audio/studio-export-poller-core";
import {
  assertSafePollerLogFields,
  formatSafePollerLog,
  redactUnsafeLogText,
} from "@/lib/audio/studio-export-poller-log";
import {
  isPollerOutOfScopeKind,
  qualifyStudioExportPollerJob,
} from "@/lib/audio/studio-export-poller-qualify";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261013120000_claim_next_studio_export_job.sql";
const SERVICE = "src/lib/audio/render-job-service.ts";
const PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const POLLER_WIRE = "src/lib/audio/studio-export-poller.ts";
const SCRIPT = "scripts/e3-render-worker-poll.ts";
const PKG = "package.json";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const baseEligible = {
  kind: "STUDIO_EXPORT",
  status: "QUEUED",
  requestedTier: "WAV",
  projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  mixSessionId: null as string | null,
  takeId: null as string | null,
  attempt: 1,
};

describe("V1 poller qualification (OD-CWP-01/02)", () => {
  it("accepts STUDIO_EXPORT WAV QUEUED with valid XOR", () => {
    expect(qualifyStudioExportPollerJob(baseEligible)).toEqual({
      eligible: true,
    });
  });

  it("rejects MIX, TAKE_EXPORT, and unknown kinds", () => {
    expect(
      qualifyStudioExportPollerJob({ ...baseEligible, kind: "MIX" }),
    ).toEqual({ eligible: false, reason: "KIND_OUT" });
    expect(
      qualifyStudioExportPollerJob({ ...baseEligible, kind: "TAKE_EXPORT" }),
    ).toEqual({ eligible: false, reason: "KIND_OUT" });
    expect(
      qualifyStudioExportPollerJob({ ...baseEligible, kind: "WEIRD" }),
    ).toEqual({ eligible: false, reason: "KIND_OUT" });
    expect(isPollerOutOfScopeKind("MIX")).toBe(true);
    expect(isPollerOutOfScopeKind("TAKE_EXPORT")).toBe(true);
    expect(isPollerOutOfScopeKind("STUDIO_EXPORT")).toBe(false);
  });

  it("rejects non-QUEUED, non-WAV, bad XOR, bad attempt", () => {
    expect(
      qualifyStudioExportPollerJob({ ...baseEligible, status: "RUNNING" }),
    ).toMatchObject({ eligible: false });
    expect(
      qualifyStudioExportPollerJob({
        ...baseEligible,
        requestedTier: "HQ_MP3",
      }),
    ).toMatchObject({ eligible: false });
    expect(
      qualifyStudioExportPollerJob({
        ...baseEligible,
        mixSessionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    ).toMatchObject({ eligible: false, reason: "SOURCE_XOR" });
    expect(
      qualifyStudioExportPollerJob({ ...baseEligible, attempt: 0 }),
    ).toMatchObject({ eligible: false });
    expect(
      qualifyStudioExportPollerJob({ ...baseEligible, attempt: 99 }),
    ).toMatchObject({ eligible: false });
  });
});

describe("Atomic claim-next migration + app contract", () => {
  const sql = read(MIGRATION);
  const service = read(SERVICE);
  const pipeline = read(PIPELINE);

  it("RPC uses SKIP LOCKED + CAS QUEUED→RUNNING + service_role only", () => {
    expect(sql).toMatch(/claim_next_studio_export_job/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/status = 'QUEUED'/);
    expect(sql).toMatch(/kind = 'STUDIO_EXPORT'/);
    expect(sql).toMatch(/requested_tier = 'WAV'/);
    expect(sql).toMatch(/SET\s+status = 'RUNNING'/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_next_studio_export_job\(text\) FROM PUBLIC/,
    );
    expect(sql).toMatch(/FROM anon/);
    expect(sql).toMatch(/FROM authenticated/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_next_studio_export_job\(text\) TO service_role/,
    );
    expect(sql).toMatch(/make_interval\(secs => 180\)/);
    expect(AUDIO_RENDER_JOB_TIMEOUT_SECONDS).toBe(180);
  });

  it("SQL never claims MIX / TAKE_EXPORT / unknown", () => {
    expect(sql).not.toMatch(/kind = 'MIX'/);
    expect(sql).not.toMatch(/kind = 'TAKE_EXPORT'/);
    expect(sql).toMatch(/kind = 'STUDIO_EXPORT'/);
  });

  it("claimNext AuthZ fails RUNNING→FAILED and does not re-QUEUED", () => {
    expect(service).toMatch(/export async function claimNextStudioExportAsWorker/);
    expect(service).toMatch(/claim_next_studio_export_job/);
    expect(service).toMatch(/studioExportAuthzFail/);
    const fnStart = service.indexOf(
      "export async function claimNextStudioExportAsWorker",
    );
    const fnEnd = service.indexOf(
      "export async function completeFakeRenderJobAsWorker",
      fnStart,
    );
    const fn = service.slice(fnStart, fnEnd);
    expect(fn).toMatch(/status:\s*"FAILED"/);
    expect(fn).toMatch(/\.eq\("status", "RUNNING"\)/);
    expect(fn).not.toMatch(/\.eq\("status", "QUEUED"\)/);
    expect(fn).not.toMatch(/status:\s*"QUEUED"/);
  });

  it("bake entry accepts RUNNING and rejects second claim", () => {
    expect(pipeline).toMatch(
      /export async function runAlreadyClaimedStudioExportWorkerJob/,
    );
    expect(pipeline).toMatch(/expected RUNNING; no second claim/);
    const bakeStart = pipeline.indexOf(
      "export async function runAlreadyClaimedStudioExportWorkerJob",
    );
    const bake = pipeline.slice(bakeStart, bakeStart + 1200);
    expect(bake).not.toMatch(/claimRenderJobAsWorker/);
    expect(bake).not.toMatch(/claimNextStudioExportAsWorker/);
  });

  it("oneshot dispatcher uses shared bake after claim-by-id", () => {
    const disp = pipeline.indexOf(
      "export async function runRealRenderWorkerJob",
    );
    const body = pipeline.slice(disp, disp + 900);
    expect(body).toMatch(/claimRenderJobAsWorker/);
    expect(body).toMatch(/runAlreadyClaimedStudioExportWorkerJob/);
  });

  it("empty-session and bake failures stay terminal (no auto-retry)", () => {
    expect(pipeline).toMatch(/STUDIO_RENDER_EMPTY_SESSION/);
    expect(pipeline).toMatch(/failRunningJob/);
    const core = read("src/lib/audio/studio-export-poller-core.ts");
    expect(core).not.toMatch(/QUEUED/);
    expect(core).toMatch(/Auto-retry forbidden/);
  });
});

describe("Concurrent claim race (simulated SKIP LOCKED)", () => {
  it("two workers competing for one job — at most one wins", async () => {
    let remaining = 1;
    const claimNext = async (workerRef: string) => {
      if (remaining <= 0) return null;
      remaining -= 1;
      return {
        job: {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          kind: "STUDIO_EXPORT",
          status: "RUNNING",
          workerRef,
        },
      };
    };

    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const a = new StudioExportPollerCore({
      workerRef: "worker-a",
      claimNext,
      bake,
      sleep: async () => {},
    });
    const b = new StudioExportPollerCore({
      workerRef: "worker-b",
      claimNext,
      bake,
      sleep: async () => {},
    });

    const [ra, rb] = await Promise.all([a.runTick(), b.runTick()]);
    const wins = [ra, rb].filter((r) => r.outcome === "bake_ok");
    const empties = [ra, rb].filter((r) => r.outcome === "empty");
    expect(wins).toHaveLength(1);
    expect(empties).toHaveLength(1);
    expect(bake).toHaveBeenCalledTimes(1);
  });
});

describe("Empty queue + single-flight + no auto-retry", () => {
  it("empty queue returns empty and does not bake", async () => {
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      claimNext: async () => null,
      bake,
    });
    expect(await poller.runTick()).toEqual({ outcome: "empty" });
    expect(poller.metrics.claims_empty).toBe(1);
    expect(bake).not.toHaveBeenCalled();
  });

  it("max one active job per instance (busy skips claim)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let claims = 0;
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      claimNext: async () => {
        claims += 1;
        return {
          job: {
            id: `job-${claims}`,
            kind: "STUDIO_EXPORT",
            status: "RUNNING",
          },
        };
      },
      bake: async () => {
        await gate;
        return { status: "SUCCEEDED" };
      },
    });

    const first = poller.runTick();
    // Allow first tick to mark busy
    await new Promise((r) => setTimeout(r, 10));
    expect(poller.isBusy()).toBe(true);
    expect(await poller.runTick()).toEqual({ outcome: "busy" });
    release();
    expect(await first).toMatchObject({ outcome: "bake_ok" });
    expect(claims).toBe(1);
    expect(poller.metrics.skipped_busy).toBe(1);
  });

  it("bake failure does not re-claim / re-queue the same job", async () => {
    const claimedIds: string[] = [];
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      claimNext: async () => {
        if (claimedIds.length >= 1) return null;
        claimedIds.push("job-1");
        return {
          job: { id: "job-1", kind: "STUDIO_EXPORT", status: "RUNNING" },
        };
      },
      bake: async () => {
        const err = new Error("empty");
        (err as Error & { code?: string }).code = "STUDIO_RENDER_EMPTY_SESSION";
        throw err;
      },
    });
    expect(await poller.runTick()).toMatchObject({
      outcome: "bake_fail",
      errorCode: "STUDIO_RENDER_EMPTY_SESSION",
    });
    expect(await poller.runTick()).toEqual({ outcome: "empty" });
    expect(claimedIds).toEqual(["job-1"]);
    expect(poller.metrics.bake_fail).toBe(1);
    expect(poller.metrics.bake_ok).toBe(0);
  });

  it("claim → bake → terminal SUCCEEDED path", async () => {
    const statuses: string[] = [];
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      claimNext: async () => {
        statuses.push("RUNNING");
        return {
          job: { id: "job-1", kind: "STUDIO_EXPORT", status: "RUNNING" },
        };
      },
      bake: async () => {
        statuses.push("SUCCEEDED");
        return { status: "SUCCEEDED" };
      },
    });
    const tick = await poller.runTick();
    expect(tick).toEqual({
      outcome: "bake_ok",
      jobId: "job-1",
      status: "SUCCEEDED",
    });
    expect(statuses).toEqual(["RUNNING", "SUCCEEDED"]);
  });
});

describe("Graceful shutdown", () => {
  it("stops new claims and finishes in-flight within grace", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let claims = 0;
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      pollMs: 5,
      shutdownGraceMs: STUDIO_EXPORT_POLLER_SHUTDOWN_GRACE_MS,
      claimNext: async () => {
        claims += 1;
        if (claims > 1) return null;
        return {
          job: { id: "job-1", kind: "STUDIO_EXPORT", status: "RUNNING" },
        };
      },
      bake: async () => {
        await gate;
        return { status: "SUCCEEDED" };
      },
      sleep: async (ms) => {
        await new Promise((r) => setTimeout(r, Math.min(ms, 5)));
      },
    });

    const loop = poller.runUntilStopped();
    await new Promise((r) => setTimeout(r, 15));
    expect(poller.isBusy()).toBe(true);
    poller.requestStop();
    expect(poller.isStopping()).toBe(true);
    release();
    const code = await loop;
    expect(code).toBe(0);
    expect(poller.metrics.shutdowns).toBe(1);
    expect(poller.metrics.bake_ok).toBe(1);
    expect(claims).toBe(1);
  });

  it("grace exceeded exits non-zero while leaving in-flight (no re-QUEUED)", async () => {
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      pollMs: 5,
      shutdownGraceMs: 40,
      claimNext: async () => ({
        job: { id: "job-1", kind: "STUDIO_EXPORT", status: "RUNNING" },
      }),
      bake: async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { status: "SUCCEEDED" };
      },
      sleep: async (ms) => {
        await new Promise((r) => setTimeout(r, Math.min(ms, 5)));
      },
    });
    const loop = poller.runUntilStopped();
    await new Promise((r) => setTimeout(r, 20));
    expect(poller.isBusy()).toBe(true);
    poller.requestStop();
    const code = await loop;
    expect(code).toBe(1);
    expect(poller.metrics.bake_ok).toBe(0);
  });
});

describe("Log hygiene — no secrets / URLs", () => {
  it("allows safe fields and rejects URL/token-like values", () => {
    expect(() =>
      assertSafePollerLogFields({
        event: "claim_ok",
        jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        kind: "STUDIO_EXPORT",
        status: "RUNNING",
        workerRef: "poller:1",
      }),
    ).not.toThrow();
    expect(() =>
      assertSafePollerLogFields({
        event: "bad",
        // @ts-expect-error intentional unsafe key probe
        objectKey: "user/x/y",
      }),
    ).toThrow(/Unsafe poller log key/);
    expect(() =>
      formatSafePollerLog({
        event: "bad",
        jobId: "https://example.com/signed?token=abc",
      }),
    ).toThrow(/Unsafe poller log value/);
    expect(
      redactUnsafeLogText("boom https://x.supabase.co/storage/v1/object/sign/a"),
    ).toBe("[REDACTED]");
  });

  it("script and wire do not log objectKey / signed URLs", () => {
    const script = read(SCRIPT);
    const wire = read(POLLER_WIRE);
    expect(script).toMatch(/redactUnsafeLogText/);
    expect(script).not.toMatch(/objectKey/);
    expect(script).not.toMatch(/signedUrl|signed_url/);
    expect(wire).toMatch(/createStudioExportPoller/);
    expect(read(PKG)).toMatch(/"e3:worker:poll"/);
  });
});
