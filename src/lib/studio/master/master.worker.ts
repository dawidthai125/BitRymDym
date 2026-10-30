/// <reference lib="webworker" />
/** Stage 3 — Mastering Web Worker: render the approved mix (+ raw sum) and the approximate preview. */

import { STUDIO_WORKER_READY } from "@/lib/studio/studio-workers";

import { runMasterRequest, type MasterWorkerRequest } from "./master-ops";

export type { MasterWorkerRequest } from "./master-ops";

type Scope = { onmessage: ((e: MessageEvent<MasterWorkerRequest>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void };
const scope = self as unknown as Scope;

scope.onmessage = (event) => {
  try {
    const { response, transfer } = runMasterRequest(event.data);
    scope.postMessage(response, transfer);
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
scope.postMessage({ type: STUDIO_WORKER_READY });
