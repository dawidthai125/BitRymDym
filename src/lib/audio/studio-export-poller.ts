/**
 * Contabo Continuous Worker V1 — wired poller (server).
 * Defaults claim-next + already-RUNNING bake. Script entry uses this.
 */

import "server-only";

import { claimNextStudioExportAsWorker } from "@/lib/audio/render-job-service";
import {
  StudioExportPollerCore,
  type StudioExportPollerCoreDeps,
} from "@/lib/audio/studio-export-poller-core";
import { runAlreadyClaimedStudioExportWorkerJob } from "@/lib/audio/render-worker-pipeline";

export {
  STUDIO_EXPORT_POLLER_DEFAULT_POLL_MS,
  STUDIO_EXPORT_POLLER_SHUTDOWN_GRACE_MS,
  StudioExportPollerCore as StudioExportPoller,
} from "@/lib/audio/studio-export-poller-core";

export type { StudioExportPollerMetrics } from "@/lib/audio/studio-export-poller-core";

export function createStudioExportPoller(
  deps: Omit<StudioExportPollerCoreDeps, "claimNext" | "bake"> & {
    claimNext?: StudioExportPollerCoreDeps["claimNext"];
    bake?: StudioExportPollerCoreDeps["bake"];
  },
): StudioExportPollerCore {
  return new StudioExportPollerCore({
    ...deps,
    claimNext:
      deps.claimNext ??
      (async (workerRef) => {
        const claimed = await claimNextStudioExportAsWorker(workerRef);
        if (!claimed) return null;
        return { job: claimed.job };
      }),
    bake:
      deps.bake ??
      (async (job) => {
        const result = await runAlreadyClaimedStudioExportWorkerJob(
          job as Parameters<typeof runAlreadyClaimedStudioExportWorkerJob>[0],
        );
        return { status: result.job.status };
      }),
  });
}
