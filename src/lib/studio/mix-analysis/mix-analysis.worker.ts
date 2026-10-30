/// <reference lib="webworker" />
/**
 * Stage 1 — Mix analysis Web Worker. Pure compute, no network.
 */

import { computeMixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";
import { STUDIO_WORKER_READY } from "@/lib/studio/studio-workers";

type WorkerScope = {
  onmessage: ((event: MessageEvent<MixAnalysisInput>) => void) | null;
  postMessage: (message: unknown) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  try {
    const metrics = computeMixMetrics(event.data, (fraction) => {
      scope.postMessage({ type: "progress", fraction });
    });
    scope.postMessage({ type: "done", metrics });
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
scope.postMessage({ type: STUDIO_WORKER_READY });
