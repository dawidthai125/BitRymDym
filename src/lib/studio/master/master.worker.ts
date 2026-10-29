/// <reference lib="webworker" />
/** Stage 3 — Mastering Web Worker: render the approved mix (+ raw sum) and the approximate preview. */

import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";

import { masterPreview, measureMaster, type Stereo } from "./dsp";
import { renderMixStereo } from "./render-mix";
import type { MasterSettings, MasterTargetId } from "./targets";

export type MasterWorkerRequest =
  | { op: "render"; input: MixAnalysisInput }
  | { op: "preview"; mix: Stereo; target: MasterTargetId; settings: MasterSettings };

type Scope = { onmessage: ((e: MessageEvent<MasterWorkerRequest>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void };
const scope = self as unknown as Scope;

scope.onmessage = (event) => {
  try {
    const req = event.data;
    if (req.op === "render") {
      const mix = renderMixStereo(req.input);
      const raw = renderMixStereo(req.input, { raw: true });
      scope.postMessage({ type: "rendered", mix, raw, mixMetrics: measureMaster(mix) }, [mix.left.buffer, mix.right.buffer, raw.left.buffer, raw.right.buffer]);
      return;
    }
    const preview = masterPreview(req.mix, req.target, req.settings);
    scope.postMessage({ type: "preview", preview, metrics: measureMaster(preview) }, [preview.left.buffer, preview.right.buffer]);
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
