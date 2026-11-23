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

import { mixHasRapPocket } from "@/lib/studio/mix-analysis/rap-pocket";
import { isSidechainKey, mixHasTrackSidechain, SidechainBus, trackSidechain } from "@/lib/studio/mix-analysis/track-sidechain";
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

/** Rough CPU cost of a track: clip samples × (1 + FX weight); reverb dominates. */
function trackCost(src: MixAnalysisInput, trackId: string): number {
  const ms = src.clips.filter((c) => c.trackId === trackId && !c.muted).reduce((n, c) => n + Math.max(0, c.durationMs), 0);
  const fx = (src.tracks.find((t) => t.id === trackId)?.effectsChain as { effects?: { type?: string; enabled?: boolean }[] } | null | undefined)?.effects ?? [];
  const w = fx.reduce((n, e) => n + (e.enabled === false ? 0 : e.type === "reverb" ? 4 : e.type === "deesser" ? 2 : 1), 0);
  return ms * (1 + w);
}

export async function renderMixStereoParallel(
  input: MixAnalysisInput,
  opts: RenderMixOptions = {},
  threads = renderThreadCount(),
  onProgress?: (fraction: number) => void,
): Promise<Stereo> {
  const src = prepareMixInput(input, opts);
  const n = Math.min(threads, src.tracks.length);
  // Pocket ducks one track from another. The thread sum drops each buffer on arrival, so that mix stays in-process.
  if (n <= 1 || (!opts.raw && mixHasRapPocket(src.tracks))) {
    const out = renderMixStereo(input, opts);
    onProgress?.(1);
    return out;
  }
  const len = mixLength(src);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const anySolo = src.tracks.some((t) => t.solo);
  const file = path.join(__dirname, "render-track-thread.ts");
  const workers = Array.from({ length: n }, () => new Worker(file));
  // Heaviest tracks first (LPT): the last thread to finish isn't stuck with a reverb track.
  // With a sidechain the key (BEAT) tracks go first: a ducked track waits for them, so few buffers are held.
  const sidechained = !opts.raw && mixHasTrackSidechain(src.tracks);
  const bus = sidechained ? new SidechainBus(src.sampleRate, len) : null;
  const keyRank = (i: number) => (sidechained && isSidechainKey(src.tracks[i]!) ? 0 : 1);
  let keysLeft = sidechained ? src.tracks.filter(isSidechainKey).length : 0;
  const held: { seq: number; left: Float32Array; right: Float32Array }[] = [];
  const order = src.tracks
    .map((t, i) => ({ i, cost: trackCost(src, t.id) }))
    .sort((a, b) => keyRank(a.i) - keyRank(b.i) || b.cost - a.cost || a.i - b.i)
    .map((x) => x.i);
  const add = (r: { left: Float32Array; right: Float32Array }) => {
    for (let i = 0; i < len; i++) {
      left[i] += r.left[i];
      right[i] += r.right[i];
    }
  };
  const duckAndAdd = (r: { seq: number; left: Float32Array; right: Float32Array }) => {
    const params = bus ? trackSidechain(src.tracks[r.seq]!) : null;
    if (bus && params) bus.duck(r.left, r.right, params);
    add(r);
  };
  const totalCost = order.reduce((n2, i) => n2 + trackCost(src, src.tracks[i]!.id), 0) || 1;
  let doneCost = 0;
  try {
    let next = 0;
    await new Promise<void>((resolve, reject) => {
      let pending = 0;
      const feed = (w: Worker) => {
        if (next >= src.tracks.length) {
          if (pending === 0) resolve();
          return;
        }
        const seq = order[next++]!;
        const track = src.tracks[seq]!;
        pending++;
        w.postMessage({ seq, input: trackInput(src, track.id), track, anySolo } satisfies TrackTask);
      };
      for (const w of workers) {
        w.on("message", (r: TrackResult) => {
          pending--;
          if (!r.ok) return reject(new Error(r.error));
          doneCost += trackCost(src, src.tracks[r.seq]!.id);
          onProgress?.(doneCost / totalCost);
          if (bus && isSidechainKey(src.tracks[r.seq]!)) {
            keysLeft--;
            if (r.use) {
              bus.addKey(r.left, r.right);
              add(r);
            }
            if (keysLeft === 0) for (const h of held.splice(0)) duckAndAdd(h);
          } else if (r.use) {
            if (bus && keysLeft > 0 && trackSidechain(src.tracks[r.seq]!)) held.push(r);
            else duckAndAdd(r);
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
