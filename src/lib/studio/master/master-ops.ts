/** Stage 3 — Mastering compute shared by the Web Worker and the main-thread fallback. */
import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";

import { masterPreview, measureMaster, type MasterMetrics, type Stereo } from "./dsp";
import { renderMixStereo } from "./render-mix";
import type { MasterSettings, MasterTargetId } from "./targets";

export type MasterWorkerRequest =
  | { op: "render"; input: MixAnalysisInput }
  | { op: "preview"; mix: Stereo; target: MasterTargetId; settings: MasterSettings };

export type MasterWorkerResponse =
  | { type: "rendered"; mix: Stereo; raw: Stereo; mixMetrics: MasterMetrics }
  | { type: "preview"; preview: Stereo; metrics: MasterMetrics };

export function runMasterRequest(req: MasterWorkerRequest): { response: MasterWorkerResponse; transfer: Transferable[] } {
  if (req.op === "render") {
    const mix = renderMixStereo(req.input);
    const raw = renderMixStereo(req.input, { raw: true });
    return {
      response: { type: "rendered", mix, raw, mixMetrics: measureMaster(mix) },
      transfer: [mix.left.buffer, mix.right.buffer, raw.left.buffer, raw.right.buffer],
    };
  }
  const preview = masterPreview(req.mix, req.target, req.settings);
  return { response: { type: "preview", preview, metrics: measureMaster(preview) }, transfer: [preview.left.buffer, preview.right.buffer] };
}
