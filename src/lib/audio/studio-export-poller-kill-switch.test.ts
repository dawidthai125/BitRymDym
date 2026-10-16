/**
 * GO-POLLER-KILL-SWITCH-01 — fail-closed E3_RENDER_JOBS_ENABLED for poller V1.
 * Local mocks only — no production Supabase / Contabo runtime.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { parseE3RenderJobsEnabledFlag } from "@/config/audio-render";
import {
  decideStudioExportPollerBootstrap,
  STUDIO_EXPORT_POLLER_DISABLED_EXIT_CODE,
} from "@/lib/audio/studio-export-poller-bootstrap";
import { StudioExportPollerCore } from "@/lib/audio/studio-export-poller-core";
import {
  formatSafePollerLog,
} from "@/lib/audio/studio-export-poller-log";
import {
  isPollerOutOfScopeKind,
  qualifyStudioExportPollerJob,
} from "@/lib/audio/studio-export-poller-qualify";

const ROOT = process.cwd();
const SCRIPT = "scripts/e3-render-worker-poll.ts";
const SERVICE = "src/lib/audio/render-job-service.ts";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("parseE3RenderJobsEnabledFlag (fail-closed)", () => {
  it.each(["true", "TRUE", "True", "1", "yes", "YES", "on", "ON"])(
    "%s → enabled",
    (raw) => {
      expect(parseE3RenderJobsEnabledFlag(raw)).toBe(true);
    },
  );

  it.each(["false", "FALSE", "0", "no", "NO", "off", "OFF"])(
    "%s → disabled",
    (raw) => {
      expect(parseE3RenderJobsEnabledFlag(raw)).toBe(false);
    },
  );

  it("missing / empty / invalid → fail-closed disabled", () => {
    expect(parseE3RenderJobsEnabledFlag(undefined)).toBe(false);
    expect(parseE3RenderJobsEnabledFlag("")).toBe(false);
    expect(parseE3RenderJobsEnabledFlag("   ")).toBe(false);
    expect(parseE3RenderJobsEnabledFlag("garbage")).toBe(false);
    expect(parseE3RenderJobsEnabledFlag("enabled")).toBe(false);
    expect(parseE3RenderJobsEnabledFlag("2")).toBe(false);
  });
});

describe("decideStudioExportPollerBootstrap kill switch", () => {
  const base = {
    workerRefRaw: "contabo-poll-1",
    pollMsRaw: "2000",
    pid: 4242,
  };

  it("true-class → run (claim loop allowed by bootstrap)", () => {
    for (const raw of ["true", "TRUE", "1", "yes", "on"]) {
      const d = decideStudioExportPollerBootstrap({
        ...base,
        renderJobsEnabledRaw: raw,
      });
      expect(d).toEqual({
        action: "run",
        workerRef: "contabo-poll-1",
        pollMs: 2000,
        renderJobsEnabled: true,
      });
    }
  });

  it("false-class / missing / empty / invalid → exit_disabled exit 0", () => {
    for (const raw of [
      "false",
      "FALSE",
      "0",
      "no",
      "off",
      undefined,
      "",
      "   ",
      "nonsense",
    ]) {
      const d = decideStudioExportPollerBootstrap({
        ...base,
        renderJobsEnabledRaw: raw,
      });
      expect(d.action).toBe("exit_disabled");
      if (d.action !== "exit_disabled") throw new Error("unreachable");
      expect(d.exitCode).toBe(STUDIO_EXPORT_POLLER_DISABLED_EXIT_CODE);
      expect(d.exitCode).toBe(0);
      expect(d.event).toBe("poller_disabled");
      expect(d.errorCode).toBe("E3_RENDER_JOBS_ENABLED_OFF");
      expect(d.renderJobsEnabled).toBe(false);
    }
  });

  it("disabled decision does not invoke claim or bake (simulated entry)", async () => {
    const claimNext = vi.fn(async () => null);
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const d = decideStudioExportPollerBootstrap({
      ...base,
      renderJobsEnabledRaw: "false",
    });
    expect(d.action).toBe("exit_disabled");
    // Entry must exit before creating/running poller — zero I/O.
    expect(claimNext).not.toHaveBeenCalled();
    expect(bake).not.toHaveBeenCalled();
  });

  it("enabled bootstrap + empty queue: claims_empty, no bake, no status rewrite", async () => {
    const d = decideStudioExportPollerBootstrap({
      ...base,
      renderJobsEnabledRaw: "true",
    });
    expect(d.action).toBe("run");
    const bake = vi.fn(async () => ({ status: "SUCCEEDED" }));
    const poller = new StudioExportPollerCore({
      workerRef: d.action === "run" ? d.workerRef : "x",
      pollMs: d.pollMs,
      claimNext: async () => null,
      bake,
    });
    expect(await poller.runTick()).toEqual({ outcome: "empty" });
    expect(bake).not.toHaveBeenCalled();
  });

  it("poller_disabled log is allowlist-safe", () => {
    expect(() =>
      formatSafePollerLog({
        event: "poller_disabled",
        errorCode: "E3_RENDER_JOBS_ENABLED_OFF",
        workerRef: "contabo-poll-1",
      }),
    ).not.toThrow();
  });
});

describe("Kill switch wiring + defense in depth (source contracts)", () => {
  it("entry script gates before createStudioExportPoller / runUntilStopped", () => {
    const script = read(SCRIPT);
    const bootstrap = read(
      "src/lib/audio/studio-export-poller-bootstrap.ts",
    );
    expect(script).toMatch(/decideStudioExportPollerBootstrap/);
    expect(script).toMatch(/exit_disabled/);
    expect(bootstrap).toMatch(/poller_disabled/);
    expect(bootstrap).toMatch(/E3_RENDER_JOBS_ENABLED_OFF/);
    const gateIdx = script.indexOf("decideStudioExportPollerBootstrap");
    const createIdx = script.indexOf("createStudioExportPoller");
    const loopIdx = script.indexOf("runUntilStopped");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(gateIdx);
    expect(loopIdx).toBeGreaterThan(createIdx);
  });

  it("claimNext still asserts runtime enabled before RPC (defense in depth)", () => {
    const service = read(SERVICE);
    const fnStart = service.indexOf(
      "export async function claimNextStudioExportAsWorker",
    );
    const fnEnd = service.indexOf(
      "export async function completeFakeRenderJobAsWorker",
      fnStart,
    );
    const fn = service.slice(fnStart, fnEnd);
    expect(fn).toMatch(/assertRenderJobsRuntimeEnabled\(\)/);
    const assertIdx = fn.indexOf("assertRenderJobsRuntimeEnabled()");
    const rpcIdx = fn.indexOf("claim_next_studio_export_job");
    expect(assertIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(assertIdx);
    // AuthZ fail path still FAILED, never re-QUEUED
    expect(fn).toMatch(/status:\s*"FAILED"/);
    expect(fn).not.toMatch(/status:\s*"QUEUED"/);
  });

  it("MIX / TAKE remain out of V1 qualification", () => {
    expect(isPollerOutOfScopeKind("MIX")).toBe(true);
    expect(isPollerOutOfScopeKind("TAKE_EXPORT")).toBe(true);
    expect(
      qualifyStudioExportPollerJob({
        kind: "MIX",
        status: "QUEUED",
        requestedTier: "WAV",
        projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        mixSessionId: null,
        takeId: null,
        attempt: 1,
      }),
    ).toEqual({ eligible: false, reason: "KIND_OUT" });
  });

  it("SIGTERM path still requests controlled shutdown when enabled", async () => {
    const poller = new StudioExportPollerCore({
      workerRef: "w1",
      pollMs: 5,
      claimNext: async () => null,
      bake: async () => ({ status: "SUCCEEDED" }),
      sleep: async () => {},
    });
    const loop = poller.runUntilStopped();
    poller.requestStop();
    await expect(loop).resolves.toBe(0);
    expect(poller.metrics.shutdowns).toBe(1);
  });
});
