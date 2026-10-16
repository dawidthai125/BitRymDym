/**
 * SFM worker poller wiring (server) — GO-SFM-WORKER-ENTRY.
 * claim_next_sfm_job → runAlreadyClaimedSfmWorkerJob.
 * Must NOT be imported by STUDIO_EXPORT poller.
 */

import "server-only";

import { claimNextSfmExecutorJobForWorker } from "@/lib/sfm/sfm-executor-service";
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
  deps: Omit<SfmWorkerPollerCoreDeps, "claimNext" | "bake"> & {
    claimNext?: SfmWorkerPollerCoreDeps["claimNext"];
    bake?: SfmWorkerPollerCoreDeps["bake"];
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
  });
}
