/**
 * Contabo Continuous Worker V1 — poller process bootstrap (pure).
 * Kill switch for E3_RENDER_JOBS_ENABLED before any claim/bake loop.
 *
 * Env changes do NOT hot-reload: stop/restart the process after changing
 * worker.env / unit Environment= (GO-POLLER-KILL-SWITCH-01).
 */

import { parseE3RenderJobsEnabledFlag } from "@/config/audio-render";

export const STUDIO_EXPORT_POLLER_DISABLED_EXIT_CODE = 0;

export type StudioExportPollerBootstrapDecision =
  | {
      action: "run";
      workerRef: string;
      pollMs: number;
      renderJobsEnabled: true;
    }
  | {
      action: "exit_disabled";
      workerRef: string;
      pollMs: number;
      renderJobsEnabled: false;
      exitCode: typeof STUDIO_EXPORT_POLLER_DISABLED_EXIT_CODE;
      event: "poller_disabled";
      errorCode: "E3_RENDER_JOBS_ENABLED_OFF";
    };

function resolveWorkerRef(raw: string | undefined, pid: number): string {
  const fromEnv = raw?.trim();
  if (fromEnv) return fromEnv;
  return `poller:${pid}`;
}

function resolvePollMs(raw: string | undefined): number {
  if (!raw?.trim()) return 2000;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 200 || n > 60_000) {
    throw new Error("E3_POLLER_POLL_MS must be 200..60000");
  }
  return Math.floor(n);
}

/**
 * Decide whether the poller process may enter the claim loop.
 * Disabled / missing / empty / invalid flag → exit_disabled (exit 0), no claim.
 */
export function decideStudioExportPollerBootstrap(input: {
  renderJobsEnabledRaw: string | undefined;
  workerRefRaw: string | undefined;
  pollMsRaw: string | undefined;
  pid: number;
}): StudioExportPollerBootstrapDecision {
  const workerRef = resolveWorkerRef(input.workerRefRaw, input.pid);
  const pollMs = resolvePollMs(input.pollMsRaw);
  const enabled = parseE3RenderJobsEnabledFlag(input.renderJobsEnabledRaw);

  if (!enabled) {
    return {
      action: "exit_disabled",
      workerRef,
      pollMs,
      renderJobsEnabled: false,
      exitCode: STUDIO_EXPORT_POLLER_DISABLED_EXIT_CODE,
      event: "poller_disabled",
      errorCode: "E3_RENDER_JOBS_ENABLED_OFF",
    };
  }

  return {
    action: "run",
    workerRef,
    pollMs,
    renderJobsEnabled: true,
  };
}
