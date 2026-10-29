/**
 * worker_threads entry (E3 only): render ONE track of the mix — clip gain/fades →
 * track FX → pan — with the same renderTrack as the browser preview, and hand the
 * stereo buffers back (transferred, not copied). See render-mix-parallel.ts.
 */
import { parentPort } from "node:worker_threads";

import { type MixAnalysisInput, type MixAnalysisTrack, renderTrack } from "@/lib/studio/mix-analysis/render";

export type TrackTask = { seq: number; input: MixAnalysisInput; track: MixAnalysisTrack; anySolo: boolean };
export type TrackResult =
  | { seq: number; ok: true; use: boolean; left: Float32Array; right: Float32Array }
  | { seq: number; ok: false; error: string };

parentPort?.on("message", (task: TrackTask) => {
  try {
    const r = renderTrack(task.input, task.track, task.anySolo);
    const use = r.audible && r.activeRanges.length > 0;
    const msg: TrackResult = { seq: task.seq, ok: true, use, left: r.left, right: r.right };
    parentPort!.postMessage(msg, [r.left.buffer as ArrayBuffer, r.right.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort!.postMessage({ seq: task.seq, ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "render_failed" } satisfies TrackResult);
  }
});
