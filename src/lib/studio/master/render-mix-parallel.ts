import "server-only";

/**
 * E3 — renderMixStereo with the per-track work (the FX chains: ~all of the CPU)
 * spread over worker_threads. Each track is rendered by the SAME renderTrack code in
 * a thread, the sum + master chain run here, so the output equals renderMixStereo
 * (up to float summation order, ~-140 dB). Only the sources a track uses are sent
 * to its thread; results come back as transferred buffers and are summed on arrival,
 * so peak memory ≈ sources + (threads × one rendered track).
 */
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";

import type { Stereo } from "./dsp";
import { finishMixStereo, mixLength, prepareMixInput, type RenderMixOptions, renderMixStereo } from "./render-mix";
import type { TrackResult, TrackTask } from "./render-track-thread";

/** STUDIO_MASTER_RENDER_THREADS (1 = in-process), default cores-1 capped at 4. */
export function renderThreadCount(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.STUDIO_MASTER_RENDER_THREADS);
  if (Number.isInteger(v) && v >= 1) return Math.min(8, v);
  return Math.max(1, Math.min(4, availableParallelism() - 1));
}

function trackInput(src: MixAnalysisInput, trackId: string): MixAnalysisInput {
  const clips = src.clips.filter((c) => c.trackId === trackId && !c.muted);
  const sources: MixAnalysisInput["sources"] = {};
  for (const c of clips) if (src.sources[c.sourceKey]) sources[c.sourceKey] = src.sources[c.sourceKey];
  return { ...src, tracks: src.tracks.filter((t) => t.id === trackId), clips, sources, masterEffectsChain: undefined };
}

export async function renderMixStereoParallel(input: MixAnalysisInput, opts: RenderMixOptions = {}, threads = renderThreadCount()): Promise<Stereo> {
  const src = prepareMixInput(input, opts);
  const n = Math.min(threads, src.tracks.length);
  if (n <= 1) return renderMixStereo(input, opts);
  const len = mixLength(src);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const anySolo = src.tracks.some((t) => t.solo);
  const file = path.join(__dirname, "render-track-thread.ts");
  const workers = Array.from({ length: n }, () => new Worker(file));
  try {
    let next = 0;
    await new Promise<void>((resolve, reject) => {
      let pending = 0;
      const feed = (w: Worker) => {
        if (next >= src.tracks.length) {
          if (pending === 0) resolve();
          return;
        }
        const seq = next++;
        const track = src.tracks[seq];
        pending++;
        w.postMessage({ seq, input: trackInput(src, track.id), track, anySolo } satisfies TrackTask);
      };
      for (const w of workers) {
        w.on("message", (r: TrackResult) => {
          pending--;
          if (!r.ok) return reject(new Error(r.error));
          if (r.use) {
            for (let i = 0; i < len; i++) {
              left[i] += r.left[i];
              right[i] += r.right[i];
            }
          }
          feed(w);
        });
        w.on("error", reject);
        w.on("exit", (code) => { if (code !== 0) reject(new Error(`render_thread_exit:${code}`)); });
      }
      for (const w of workers) feed(w);
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return finishMixStereo(src, left, right, opts);
}
