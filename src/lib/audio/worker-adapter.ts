/**
 * E3.5 — Vendor-neutral Render Worker Adapter (OAD-02 / OD-E35-03).
 * Domain AuthZ/caps/capability decisions stay in Job Domain Service.
 */

export type WorkerEnqueueResult = {
  workerRef: string;
};

export type WorkerRemoteState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkerStatusResult = {
  state: WorkerRemoteState;
  progress?: number | null;
  error?: string | null;
};

export type RenderWorkerAdapter = {
  enqueue(jobId: string, payload: Record<string, unknown>): Promise<WorkerEnqueueResult>;
  getStatus(workerRef: string): Promise<WorkerStatusResult>;
  cancel(workerRef: string): Promise<void>;
};

/**
 * Fake adapter: records enqueue refs only.
 * Progression happens via worker-secret CLAIM/complete endpoints + Fake driver
 * (EXTERNAL WORKER class — not user-request in-process).
 */
export function createFakeRenderWorkerAdapter(): RenderWorkerAdapter {
  const cancelled = new Set<string>();

  return {
    async enqueue(jobId) {
      return { workerRef: `fake:${jobId}` };
    },
    async getStatus(workerRef) {
      if (cancelled.has(workerRef)) {
        return { state: "cancelled", progress: null, error: null };
      }
      return { state: "queued", progress: null, error: null };
    },
    async cancel(workerRef) {
      cancelled.add(workerRef);
    },
  };
}

let defaultAdapter: RenderWorkerAdapter | null = null;

export function getRenderWorkerAdapter(): RenderWorkerAdapter {
  if (!defaultAdapter) {
    defaultAdapter = createFakeRenderWorkerAdapter();
  }
  return defaultAdapter;
}

/** Test-only override. */
export function setRenderWorkerAdapterForTests(
  adapter: RenderWorkerAdapter | null,
): void {
  defaultAdapter = adapter;
}
