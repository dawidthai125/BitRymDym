/**
 * SFM worker poller wiring (server) — GO-SFM-WORKER-ENTRY + KIND-REJECT.
 * claim_next_sfm_job → runAlreadyClaimedSfmWorkerJob.
 * Unsupported kind → reject_sfm_executor_job_kind (FAILED/KIND_OUT).
 * Must NOT be imported by STUDIO_EXPORT poller.
 */

import "server-only";

import {
  claimNextSfmExecutorJobForWorker,
  rejectSfmExecutorJobKindForWorker,
} from "@/lib/sfm/sfm-executor-service";
import { toSfmAlreadyClaimedWorkerJob } from "@/lib/sfm/sfm-worker-core";
import {
  SfmWorkerPollerCore,
  type SfmWorkerPollerCoreDeps,
} from "@/lib/sfm/sfm-worker-poller-core";
import { runAlreadyClaimedSfmWorkerJob } from "@/lib/sfm/sfm-worker-pipeline";

export {
  SFM_WORKER_POLLER_DEFAULT_POLL_MS,
  SFM_WORKER_POLLER_SHUTDOWN_GRACE_MS,
  SfmWorkerPollerCore as SfmWorkerPoller,
} from "@/lib/sfm/sfm-worker-poller-core";

export type { SfmWorkerPollerMetrics } from "@/lib/sfm/sfm-worker-poller-core";

export function createSfmWorkerPoller(
  deps: Omit<
    SfmWorkerPollerCoreDeps,
    "claimNext" | "bake" | "rejectUnsupportedKind"
  > & {
    claimNext?: SfmWorkerPollerCoreDeps["claimNext"];
    bake?: SfmWorkerPollerCoreDeps["bake"];
    rejectUnsupportedKind?: SfmWorkerPollerCoreDeps["rejectUnsupportedKind"];
  },
): SfmWorkerPollerCore {
  return new SfmWorkerPollerCore({
    ...deps,
    claimNext:
      deps.claimNext ??
      (async (workerRef) => {
        const claimed = await claimNextSfmExecutorJobForWorker(workerRef);
        if (!claimed) return null;
        // Explicit pick — keeps ownerId / projectId / sfmVersionId / sfmQuality.
        return { job: toSfmAlreadyClaimedWorkerJob(claimed.job) };
      }),
    bake:
      deps.bake ??
      (async (job) => {
        // Pipeline marks job SUCCEEDED/FAILED internally; throws on failure.
        // job is SfmAlreadyClaimedWorkerJob — no cast required.
        await runAlreadyClaimedSfmWorkerJob(job);
        return { status: "SUCCEEDED" };
      }),
    rejectUnsupportedKind:
      deps.rejectUnsupportedKind ??
      (async (job, workerRef) => {
        // Single mutation path — RPC CAS only; no alternate status mutation.
        const result = await rejectSfmExecutorJobKindForWorker(
          job.id,
          workerRef,
        );
        return result.outcome === "rejected" ? "rejected" : "cas_miss";
      }),
  });
}
