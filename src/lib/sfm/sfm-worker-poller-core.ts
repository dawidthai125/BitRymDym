/**
 * SFM worker poll loop core (no server-only / no DB imports).
 * Injectable claim + bake for unit tests.
 * Concurrency = 1. No auto-retry / no FAILED→QUEUED.
 * Separate from StudioExportPollerCore (STUDIO_EXPORT unchanged).
 */

import { isSfmExecutorJobKind } from "@/lib/audio/render-job-core";
import {
  formatSafePollerLog,
  type SafePollerLogFields,
} from "@/lib/audio/studio-export-poller-log";
import type { SfmAlreadyClaimedWorkerJob } from "@/lib/sfm/sfm-worker-core";

/** Align with SFM claim timeout class (180s) + margin. */
export const SFM_WORKER_POLLER_SHUTDOWN_GRACE_MS = 200_000;

export const SFM_WORKER_POLLER_DEFAULT_POLL_MS = 2_000;

/** Same shape as pipeline input — must carry claim fields through bake. */
export type SfmWorkerPollerJob = SfmAlreadyClaimedWorkerJob;

export type SfmWorkerPollerMetrics = {
  claims_ok: number;
  claims_empty: number;
  claims_fail: number;
  kind_reject: number;
  bake_fail: number;
  bake_ok: number;
  shutdowns: number;
  skipped_busy: number;
};

export type SfmWorkerPollerClaimResult = {
  job: SfmWorkerPollerJob;
} | null;

export type SfmWorkerPollerCoreDeps = {
  workerRef: string;
  pollMs?: number;
  shutdownGraceMs?: number;
  claimNext: (workerRef: string) => Promise<SfmWorkerPollerClaimResult>;
  bake: (job: SfmWorkerPollerJob) => Promise<{ status: string }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (fields: SafePollerLogFields) => void;
};

export type SfmWorkerPollerTickResult =
  | { outcome: "empty" }
  | { outcome: "busy" }
  | { outcome: "stopping" }
  | { outcome: "claim_fail"; errorCode?: string }
  | { outcome: "kind_reject"; jobId: string; kind: string }
  | { outcome: "claim_started"; jobId: string; kind: string }
  | { outcome: "bake_ok"; jobId: string; kind: string; status: string }
  | { outcome: "bake_fail"; jobId: string; kind: string; errorCode?: string };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultLog(fields: SafePollerLogFields): void {
  console.log(formatSafePollerLog(fields));
}

/**
 * Single-flight SFM executor poller. Max one active bake.
 * Claims only via injected claimNext (must be claim_next_sfm_job path).
 */
export class SfmWorkerPollerCore {
  readonly workerRef: string;
  readonly pollMs: number;
  readonly shutdownGraceMs: number;
  readonly metrics: SfmWorkerPollerMetrics = {
    claims_ok: 0,
    claims_empty: 0,
    claims_fail: 0,
    kind_reject: 0,
    bake_fail: 0,
    bake_ok: 0,
    shutdowns: 0,
    skipped_busy: 0,
  };

  private stopping = false;
  private busy = false;
  private inFlight: Promise<void> | null = null;
  private readonly claimNext: SfmWorkerPollerCoreDeps["claimNext"];
  private readonly bake: SfmWorkerPollerCoreDeps["bake"];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (fields: SafePollerLogFields) => void;

  constructor(deps: SfmWorkerPollerCoreDeps) {
    this.workerRef = deps.workerRef.trim();
    if (!this.workerRef) {
      throw new Error("workerRef required");
    }
    this.pollMs = deps.pollMs ?? SFM_WORKER_POLLER_DEFAULT_POLL_MS;
    this.shutdownGraceMs =
      deps.shutdownGraceMs ?? SFM_WORKER_POLLER_SHUTDOWN_GRACE_MS;
    this.claimNext = deps.claimNext;
    this.bake = deps.bake;
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? defaultLog;
  }

  isBusy(): boolean {
    return this.busy;
  }

  isStopping(): boolean {
    return this.stopping;
  }

  requestStop(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.metrics.shutdowns += 1;
    this.log({
      event: "shutdown_requested",
      workerRef: this.workerRef,
      busy: this.busy,
    });
  }

  /**
   * @param awaitBake default true — unit tests await terminal bake.
   * Poll loop uses awaitBake=false so SIGTERM can stop new claims while bake runs.
   */
  async runTick(options?: {
    awaitBake?: boolean;
  }): Promise<SfmWorkerPollerTickResult> {
    const awaitBake = options?.awaitBake !== false;
    if (this.stopping) {
      return { outcome: "stopping" };
    }
    if (this.busy) {
      this.metrics.skipped_busy += 1;
      return { outcome: "busy" };
    }

    let claimed: SfmWorkerPollerClaimResult;
    try {
      claimed = await this.claimNext(this.workerRef);
    } catch (err) {
      this.metrics.claims_fail += 1;
      const errorCode =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "CLAIM_FAILED";
      this.log({
        event: "claim_fail",
        errorCode,
        workerRef: this.workerRef,
      });
      return { outcome: "claim_fail", errorCode };
    }

    if (!claimed) {
      this.metrics.claims_empty += 1;
      this.log({
        event: "claims_empty",
        workerRef: this.workerRef,
        busy: false,
      });
      return { outcome: "empty" };
    }

    const jobId = claimed.job.id;
    const kind = claimed.job.kind;

    if (!isSfmExecutorJobKind(kind)) {
      this.metrics.kind_reject += 1;
      this.log({
        event: "kind_reject",
        jobId,
        kind,
        errorCode: "KIND_OUT",
        workerRef: this.workerRef,
      });
      // Do not bake; do not auto-requeue. Job remains as claimed by RPC
      // (RUNNING) — recovery is operator/RPC path, not poller auto-retry.
      return { outcome: "kind_reject", jobId, kind };
    }

    this.metrics.claims_ok += 1;
    this.log({
      event: "claim_ok",
      jobId,
      kind,
      status: "RUNNING",
      workerRef: this.workerRef,
    });

    this.busy = true;
    const started = this.now();
    let bakeStatus = "SUCCEEDED";
    let bakeErrorCode: string | undefined;
    let bakeFailed = false;

    this.inFlight = (async () => {
      try {
        const result = await this.bake(claimed!.job);
        bakeStatus = result.status;
        this.metrics.bake_ok += 1;
        this.log({
          event: "bake_ok",
          jobId,
          kind,
          status: result.status,
          durationMs: this.now() - started,
          workerRef: this.workerRef,
        });
      } catch (err) {
        bakeFailed = true;
        this.metrics.bake_fail += 1;
        bakeErrorCode =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "BAKE_FAILED";
        this.log({
          event: "bake_fail",
          jobId,
          kind,
          errorCode: bakeErrorCode,
          durationMs: this.now() - started,
          workerRef: this.workerRef,
        });
      } finally {
        this.busy = false;
        this.inFlight = null;
      }
    })();

    if (!awaitBake) {
      return { outcome: "claim_started", jobId, kind };
    }

    await this.inFlight;
    if (bakeFailed) {
      return { outcome: "bake_fail", jobId, kind, errorCode: bakeErrorCode };
    }
    return { outcome: "bake_ok", jobId, kind, status: bakeStatus };
  }

  async runUntilStopped(): Promise<number> {
    while (!this.stopping) {
      if (!this.busy) {
        await this.runTick({ awaitBake: false });
      }
      if (this.stopping) break;
      await this.sleep(this.pollMs);
    }

    if (this.inFlight !== null) {
      const graceDeadline = this.now() + this.shutdownGraceMs;
      while (this.inFlight !== null && this.now() < graceDeadline) {
        await this.sleep(50);
      }
      if (this.inFlight !== null) {
        this.log({
          event: "shutdown_grace_exceeded",
          workerRef: this.workerRef,
          busy: true,
        });
        // Do not mark in-flight job FAILED solely because of signal —
        // job status is owned by bake/pipeline/RPC.
        return 1;
      }
    }

    this.log({
      event: "shutdown_clean",
      workerRef: this.workerRef,
      busy: false,
    });
    return 0;
  }
}
