/** Stage 3 — browser side of Mastering: preview workers + fetching E3 results (no uploads). */
import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";
import { spawnStudioWorker } from "@/lib/studio/studio-workers";

import type { MasterMetrics, Stereo } from "./dsp";
import { runMasterRequest, type MasterWorkerRequest } from "./master-ops";
import type { MasterSettings, MasterTargetId } from "./targets";

/** 44.1 kHz render: what the user approved is what the E3 master receives. */
export const MASTER_RENDER_SAMPLE_RATE = 44100;

/** Run one request in the prebuilt Web Worker; on the main thread when the worker cannot start. */
async function call<T>(msg: MasterWorkerRequest, transfer: Transferable[] = []): Promise<T> {
  const worker = await spawnStudioWorker("master");
  if (!worker) return runMasterRequest(msg).response as T;
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ type: string; message?: string }>) => {
      worker.terminate();
      if (e.data.type === "error") reject(new Error(e.data.message ?? "worker_error"));
      else resolve(e.data as T);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("worker_error"));
    };
    worker.postMessage(msg, transfer);
  });
}

export function renderApprovedMix(input: MixAnalysisInput) {
  return call<{ mix: Stereo; raw: Stereo; mixMetrics: MasterMetrics }>({ op: "render", input });
}

export function renderMasterPreview(mix: Stereo, target: MasterTargetId, settings: MasterSettings) {
  // Copy: the main thread keeps the mix for A/B and further previews.
  const copy: Stereo = { left: mix.left.slice(), right: mix.right.slice(), sampleRate: mix.sampleRate };
  return call<{ preview: Stereo; metrics: MasterMetrics }>({ op: "preview", mix: copy, target, settings }, [copy.left.buffer, copy.right.buffer]);
}

export function stereoToAudioBuffer(ctx: BaseAudioContext, s: Stereo, gainDb = 0): AudioBuffer {
  const b = ctx.createBuffer(2, s.left.length, s.sampleRate);
  const k = Math.pow(10, gainDb / 20);
  const l = new Float32Array(s.left.length);
  const r = new Float32Array(s.right.length);
  for (let i = 0; i < l.length; i++) { l[i] = s.left[i] * k; r[i] = s.right[i] * k; }
  b.copyToChannel(l, 0);
  b.copyToChannel(r, 1);
  return b;
}

/** PUT a blob to a Supabase signed upload URL. */

/** Fetch a parted result and join it into one Blob (object URL for <audio>/download). */
export async function joinParts(urls: string[], type: string): Promise<Blob | null> {
  const chunks: Blob[] = [];
  for (const u of urls) {
    const r = await fetch(u);
    if (!r.ok) return null;
    chunks.push(await r.blob());
  }
  return new Blob(chunks, { type });
}
