/**
 * Stage 1 — Mix analysis client: decode clip sources in the browser
 * (OfflineAudioContext), then compute metrics in a Web Worker with a
 * hard time budget. No server, no paid API.
 */

import { computeMixMetrics, type MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type {
  MixAnalysisClip,
  MixAnalysisInput,
  MixAnalysisSource,
} from "@/lib/studio/mix-analysis/render";
import { buildMixVerdict, type MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";

/** Analysis sample rate: covers 5–9 kHz sibilance band, keeps memory low. */
export const MIX_ANALYSIS_SAMPLE_RATE = 32000;
/** Hard budget for decode + compute. */
export const MIX_ANALYSIS_TIMEOUT_MS = 45000;
/** Longest timeline analysed (ms). */
export const MIX_ANALYSIS_MAX_LENGTH_MS = 10 * 60 * 1000;

export type MixAnalysisFailure =
  | "no_audio"
  | "decode_failed"
  | "timeout"
  | "aborted"
  | "error";

export type MixAnalysisOutcome =
  | { ok: true; metrics: MixMetrics; verdict: MixVerdict; elapsedMs: number }
  | { ok: false; reason: MixAnalysisFailure };

export function clipSourceKey(clip: Pick<StudioClipDto, "sourceKind" | "sourceTakeId" | "sourceBeatId">): string | null {
  if (clip.sourceKind === "TAKE" && clip.sourceTakeId) return `take:${clip.sourceTakeId}`;
  if (clip.sourceKind === "BEAT_REF" && clip.sourceBeatId) return `beat:${clip.sourceBeatId}`;
  return null;
}

/** Document → analysis skeleton (sources filled by the caller). */
export function buildMixAnalysisSkeleton(
  doc: StudioProjectDocument,
  sampleRate = MIX_ANALYSIS_SAMPLE_RATE,
): Omit<MixAnalysisInput, "sources"> & { sourceClips: Map<string, StudioClipDto> } {
  const sourceClips = new Map<string, StudioClipDto>();
  const clips: MixAnalysisClip[] = [];
  for (const c of doc.clips) {
    const key = clipSourceKey(c);
    if (!key) continue;
    if (c.sourceKind === "BEAT_REF" && doc.project.beatId && c.sourceBeatId !== doc.project.beatId) continue;
    if (!sourceClips.has(key)) sourceClips.set(key, c);
    clips.push({
      trackId: c.trackId,
      sourceKey: key,
      sourceOffsetMs: c.sourceOffsetMs,
      timelineStartMs: c.timelineStartMs,
      durationMs: c.durationMs || doc.project.timelineLengthMs,
      gainDb: c.gainDb,
      muted: c.muted,
      fadeInMs: c.fadeInMs,
      fadeOutMs: c.fadeOutMs,
    });
  }
  const contentEnd = clips.reduce((m, c) => Math.max(m, c.timelineStartMs + c.durationMs), 0);
  return {
    sampleRate,
    lengthMs: Math.min(MIX_ANALYSIS_MAX_LENGTH_MS, Math.max(1000, Math.min(doc.project.timelineLengthMs || contentEnd, contentEnd || 1000))),
    masterGainDb: doc.project.masterGainDb,
    masterPan: doc.project.masterPan,
    tracks: doc.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.trackRole,
      gainDb: t.gainDb,
      pan: t.pan,
      muted: t.muted,
      solo: t.solo,
    })),
    clips,
    sourceClips,
  };
}

async function decode(url: string, sampleRate: number, signal: AbortSignal): Promise<MixAnalysisSource | null> {
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  const Ctor =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor(2, 1, sampleRate);
  const buffer = await ctx.decodeAudioData(bytes);
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    channels.push(new Float32Array(buffer.getChannelData(c)));
  }
  return { channels };
}

function runInWorker(
  input: MixAnalysisInput,
  onProgress: (f: number) => void,
  signal: AbortSignal,
): Promise<MixMetrics> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(computeMixMetrics(input, onProgress));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mix-analysis.worker.ts", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", stop, { once: true });
    worker.onmessage = (event: MessageEvent<{ type: string; fraction?: number; metrics?: MixMetrics; message?: string }>) => {
      const msg = event.data;
      if (msg.type === "progress" && typeof msg.fraction === "number") onProgress(msg.fraction);
      if (msg.type === "done" && msg.metrics) {
        signal.removeEventListener("abort", stop);
        worker.terminate();
        resolve(msg.metrics);
      }
      if (msg.type === "error") {
        signal.removeEventListener("abort", stop);
        worker.terminate();
        reject(new Error(msg.message ?? "worker error"));
      }
    };
    worker.onerror = (e) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      reject(new Error(e.message));
    };
    const transfer: Transferable[] = [];
    for (const s of Object.values(input.sources)) for (const ch of s.channels) transfer.push(ch.buffer);
    worker.postMessage(input, transfer);
  });
}

/**
 * Stage 3 — decode every clip source into a full render input (used by Mastering
 * to render the approved mix as one stereo track). Null when nothing decodes.
 */
export async function decodeMixAnalysisInput(params: {
  doc: StudioProjectDocument;
  resolveSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  sampleRate: number;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
}): Promise<MixAnalysisInput | null> {
  const skeleton = buildMixAnalysisSkeleton(params.doc, params.sampleRate);
  const sources: Record<string, MixAnalysisSource> = {};
  let done = 0;
  for (const [key, clip] of skeleton.sourceClips) {
    if (params.signal.aborted) return null;
    const url = await params.resolveSourceUrl(clip);
    const decoded = url ? await decode(url, skeleton.sampleRate, params.signal).catch(() => null) : null;
    if (decoded) sources[key] = decoded;
    done++;
    params.onProgress?.(done / skeleton.sourceClips.size);
  }
  if (Object.keys(sources).length === 0) return null;
  const { sourceClips: _unused, ...rest } = skeleton;
  void _unused;
  return { ...rest, sources };
}

/**
 * Full analysis. `onProgress` gets 0–1 (decode ≈ first 40%).
 * Never throws; returns a typed failure instead.
 */
export async function runStudioMixAnalysis(params: {
  doc: StudioProjectDocument;
  resolveSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<MixAnalysisOutcome> {
  const started = Date.now();
  const controller = new AbortController();
  const outer = params.signal;
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener("abort", onOuterAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, params.timeoutMs ?? MIX_ANALYSIS_TIMEOUT_MS);
  const progress = params.onProgress ?? (() => {});
  try {
    const skeleton = buildMixAnalysisSkeleton(params.doc);
    if (skeleton.sourceClips.size === 0) return { ok: false, reason: "no_audio" };
    const sources: Record<string, MixAnalysisSource> = {};
    let done = 0;
    for (const [key, clip] of skeleton.sourceClips) {
      if (controller.signal.aborted) break;
      const url = await params.resolveSourceUrl(clip);
      const decoded = url ? await decode(url, skeleton.sampleRate, controller.signal).catch(() => null) : null;
      if (decoded) sources[key] = decoded;
      done++;
      progress((0.4 * done) / skeleton.sourceClips.size);
    }
    if (controller.signal.aborted) return { ok: false, reason: timedOut ? "timeout" : "aborted" };
    if (Object.keys(sources).length === 0) return { ok: false, reason: "decode_failed" };
    const { sourceClips: _unused, ...rest } = skeleton;
    void _unused;
    const metrics = await runInWorker({ ...rest, sources }, (f) => progress(0.4 + 0.6 * f), controller.signal);
    return { ok: true, metrics, verdict: buildMixVerdict(metrics), elapsedMs: Date.now() - started };
  } catch {
    if (controller.signal.aborted) return { ok: false, reason: timedOut ? "timeout" : "aborted" };
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}
