/**
 * SFM worker process bootstrap (pure) — GO-SFM-WORKER-ENTRY.
 *
 * Process kill switch: SFM_WORKER_ENABLED (≠ SFM_VERSIONS_V1 product flag).
 * Product gate: SFM_VERSIONS_V1 must also be ON before claim loop.
 * Env changes do NOT hot-reload — stop/restart the process.
 */

import {
  isSfmVersionsV1Enabled,
  parseSfmWorkerEnabledFlag,
} from "@/config/audio-render";

export const SFM_WORKER_POLLER_DISABLED_EXIT_CODE = 0;

export type SfmWorkerPollerBootstrapDecision =
  | {
      action: "run";
      workerRef: string;
      pollMs: number;
      sfmWorkerEnabled: true;
      sfmVersionsV1: true;
    }
  | {
      action: "exit_disabled";
      workerRef: string;
      pollMs: number;
      sfmWorkerEnabled: boolean;
      sfmVersionsV1: boolean;
      exitCode: typeof SFM_WORKER_POLLER_DISABLED_EXIT_CODE;
      event: "poller_disabled";
      errorCode:
        | "SFM_WORKER_ENABLED_OFF"
        | "SFM_VERSIONS_V1_OFF";
    };

function resolveWorkerRef(raw: string | undefined, pid: number): string {
  const fromEnv = raw?.trim();
  if (fromEnv) return fromEnv;
  return `sfm-poller:${pid}`;
}

function resolvePollMs(raw: string | undefined): number {
  if (!raw?.trim()) return 2000;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 200 || n > 60_000) {
    throw new Error("SFM_WORKER_POLL_MS must be 200..60000");
  }
  return Math.floor(n);
}

/**
 * Decide whether the SFM worker may enter the claim loop.
 * Disabled / missing / empty / invalid SFM_WORKER_ENABLED → exit_disabled.
 * SFM_VERSIONS_V1 OFF → exit_disabled (no claim while product flag OFF).
 */
export function decideSfmWorkerPollerBootstrap(input: {
  sfmWorkerEnabledRaw: string | undefined;
  sfmVersionsV1Raw: string | undefined;
  workerRefRaw: string | undefined;
  pollMsRaw: string | undefined;
  pid: number;
}): SfmWorkerPollerBootstrapDecision {
  const workerRef = resolveWorkerRef(input.workerRefRaw, input.pid);
  const pollMs = resolvePollMs(input.pollMsRaw);
  const workerEnabled = parseSfmWorkerEnabledFlag(input.sfmWorkerEnabledRaw);
  const versionsEnabled = isSfmVersionsV1Enabled(input.sfmVersionsV1Raw);

  if (!workerEnabled) {
    return {
      action: "exit_disabled",
      workerRef,
      pollMs,
      sfmWorkerEnabled: false,
      sfmVersionsV1: versionsEnabled,
      exitCode: SFM_WORKER_POLLER_DISABLED_EXIT_CODE,
      event: "poller_disabled",
      errorCode: "SFM_WORKER_ENABLED_OFF",
    };
  }

  if (!versionsEnabled) {
    return {
      action: "exit_disabled",
      workerRef,
      pollMs,
      sfmWorkerEnabled: true,
      sfmVersionsV1: false,
      exitCode: SFM_WORKER_POLLER_DISABLED_EXIT_CODE,
      event: "poller_disabled",
      errorCode: "SFM_VERSIONS_V1_OFF",
    };
  }

  return {
    action: "run",
    workerRef,
    pollMs,
    sfmWorkerEnabled: true,
    sfmVersionsV1: true,
  };
}
