/** Stage 3 — browser side of Mastering: worker calls + WAV encoding for the server upload. */
import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";

import type { MasterMetrics, Stereo } from "./dsp";
import type { MasterSettings, MasterTargetId } from "./targets";

/** 44.1 kHz render: what the user approved is what the E3 master receives. */
export const MASTER_RENDER_SAMPLE_RATE = 44100;

function call<T>(msg: unknown, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./master.worker.ts", import.meta.url), { type: "module" });
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

/** 32-bit float stereo WAV (lossless hand-off to the E3 master). */
export function encodeWavFloat(s: Stereo): Blob {
  const n = s.left.length;
  const dataBytes = n * 2 * 4;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 2, true);
  v.setUint32(24, s.sampleRate, true); v.setUint32(28, s.sampleRate * 8, true); v.setUint16(32, 8, true); v.setUint16(34, 32, true);
  str(36, "data"); v.setUint32(40, dataBytes, true);
  const f = new Float32Array(buf, 44, n * 2);
  for (let i = 0; i < n; i++) { f[2 * i] = s.left[i]; f[2 * i + 1] = s.right[i]; }
  return new Blob([buf], { type: "audio/wav" });
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
export async function uploadToSignedUrl(url: string, blob: Blob): Promise<boolean> {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream", "x-upsert": "true" }, body: blob });
  return res.ok;
}
