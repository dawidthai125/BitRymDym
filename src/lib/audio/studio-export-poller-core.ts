/**
 * Contabo Continuous Worker V1 — poll loop core (no server-only / no DB imports).
 * Injectable claim + bake for unit tests. Auto-retry forbidden.
 */

import {
  formatSafePollerLog,
  type SafePollerLogFields,
} from "@/lib/audio/studio-export-poller-log";

/** ≥ job timeout class (180s); Design Freeze §7 propose 200s. */
export const STUDIO_EXPORT_POLLER_SHUTDOWN_GRACE_MS = 200_000;

export const STUDIO_EXPORT_POLLER_DEFAULT_POLL_MS = 2_000;

export type StudioExportPollerJob = {
  id: string;
  kind: string;
  status: string;
};

export type StudioExportPollerMetrics = {
  claims_ok: number;
  claims_empty: number;
  authz_fail: number;
  bake_fail: number;
  bake_ok: number;
  shutdowns: number;
  skipped_busy: number;
};

export type StudioExportPollerClaimResult = {
  job: StudioExportPollerJob;
} | null;

export type StudioExportPollerCoreDeps = {
  workerRef: string;
  pollMs?: number;
  shutdownGraceMs?: number;
  claimNext: (workerRef: string) => Promise<StudioExportPollerClaimResult>;
  bake: (job: StudioExportPollerJob) => Promise<{ status: string }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (fields: SafePollerLogFields) => void;
};

export type StudioExportPollerTickResult =
  | { outcome: "empty" }
  | { outcome: "busy" }
  | { outcome: "stopping" }
  | { outcome: "authz_fail"; jobId: string }
  | { outcome: "claim_started"; jobId: string }
  | { outcome: "bake_ok"; jobId: string; status: string }
  | { outcome: "bake_fail"; jobId: string; errorCode?: string };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultLog(fields: SafePollerLogFields): void {
  // eslint-disable-next-line no-console -- worker process stdout
  console.log(formatSafePollerLog(fields));
}

/**
 * Single-flight STUDIO_EXPORT poller. Max one active bake (OD-CWP-03).
 */
export class StudioExportPollerCore {
  readonly workerRef: string;
  readonly pollMs: number;
  readonly shutdownGraceMs: number;
  readonly metrics: StudioExportPollerMetrics = {
    claims_ok: 0,
    claims_empty: 0,
    authz_fail: 0,
    bake_fail: 0,
    bake_ok: 0,
    shutdowns: 0,
    skipped_busy: 0,
  };

  private stopping = false;
  private busy = false;
  private inFlight: Promise<void> | null = null;
  private readonly claimNext: StudioExportPollerCoreDeps["claimNext"];
  private readonly bake: StudioExportPollerCoreDeps["bake"];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (fields: SafePollerLogFields) => void;

  constructor(deps: StudioExportPollerCoreDeps) {
    this.workerRef = deps.workerRef.trim();
    if (!this.workerRef) {
      throw new Error("workerRef required");
    }
    this.pollMs = deps.pollMs ?? STUDIO_EXPORT_POLLER_DEFAULT_POLL_MS;
    this.shutdownGraceMs =
      deps.shutdownGraceMs ?? STUDIO_EXPORT_POLLER_SHUTDOWN_GRACE_MS;
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
  }): Promise<StudioExportPollerTickResult> {
    const awaitBake = options?.awaitBake !== false;
    if (this.stopping) {
      return { outcome: "stopping" };
    }
    if (this.busy) {
      this.metrics.skipped_busy += 1;
      return { outcome: "busy" };
    }

    let claimed: StudioExportPollerClaimResult;
    try {
      claimed = await this.claimNext(this.workerRef);
    } catch (err) {
      const authz =
        err &&
        typeof err === "object" &&
        "studioExportAuthzFail" in err &&
        (err as { studioExportAuthzFail?: boolean }).studioExportAuthzFail ===
          true;
      if (authz) {
        this.metrics.claims_ok += 1;
        this.metrics.authz_fail += 1;
        const jobId =
          "jobId" in err && (err as { jobId?: unknown }).jobId != null
            ? String((err as { jobId: unknown }).jobId)
            : "unknown";
        const errorCode =
          "errorCode" in err &&
          (err as { errorCode?: unknown }).errorCode != null
            ? String((err as { errorCode: unknown }).errorCode)
            : "SOURCE";
        this.log({
          event: "authz_fail",
          jobId,
          kind: "STUDIO_EXPORT",
          errorCode,
          workerRef: this.workerRef,
        });
        return { outcome: "authz_fail", jobId };
      }
      throw err;
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

    this.metrics.claims_ok += 1;
    const jobId = claimed.job.id;
    this.log({
      event: "claim_ok",
      jobId,
      kind: "STUDIO_EXPORT",
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
          kind: "STUDIO_EXPORT",
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
          kind: "STUDIO_EXPORT",
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
      return { outcome: "claim_started", jobId };
    }

    await this.inFlight;
    if (bakeFailed) {
      return { outcome: "bake_fail", jobId, errorCode: bakeErrorCode };
    }
    return { outcome: "bake_ok", jobId, status: bakeStatus };
  }

  async runUntilStopped(): Promise<number> {
    while (!this.stopping) {
      if (!this.busy) {
        await this.runTick({ awaitBake: false });
      }
      if (this.stopping) break;
      await this.sleep(this.pollMs);
    }

    // Truthy checks on Promise are always true (TS2801). Compare to null;
    // after each await, finally may have cleared inFlight.
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
