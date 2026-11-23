/**
 * Stage 1 — Mix analysis client: decode clip sources in the browser
 * (OfflineAudioContext), then compute metrics in a Web Worker with a
 * hard time budget. No server, no paid API.
 */

import { STUDIO_MAX_SONG_MS } from "@/config/studio";
import { preloadAcousticBank } from "@/lib/studio/acoustic-load";
import { computeMixMetrics, type MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type {
  MixAnalysisClip,
  MixAnalysisInput,
  MixAnalysisSource,
} from "@/lib/studio/mix-analysis/render";
import { buildMixVerdict, type MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";
import { spawnStudioWorker } from "@/lib/studio/studio-workers";

/** Analysis sample rate: covers 5–9 kHz sibilance band, keeps memory low. */
export const MIX_ANALYSIS_SAMPLE_RATE = 32000;
/** Minimum budget for decode + compute (short projects). */
export const MIX_ANALYSIS_TIMEOUT_MS = 45000;
/** Ceiling for the budget (4:00, 8 tracks with reverb/delay). */
export const MIX_ANALYSIS_MAX_TIMEOUT_MS = 300000;

/**
 * Time budget scaled by the amount of audio to process (sum of clip durations):
 * 30 s + 0.25 s per second of audio, clamped to [45 s, 300 s].
 * A 4:00 song on 8 tracks with FX needs ~1.5–2 min on a mid laptop.
 */
export function mixAnalysisTimeoutMs(clips: ReadonlyArray<Pick<MixAnalysisClip, "durationMs" | "muted">>): number {
  const audioMs = clips.reduce((sum, c) => sum + (c.muted ? 0 : Math.max(0, c.durationMs)), 0);
  return Math.min(MIX_ANALYSIS_MAX_TIMEOUT_MS, Math.max(MIX_ANALYSIS_TIMEOUT_MS, Math.round(30000 + audioMs * 0.25)));
}
/** Longest timeline analysed (ms). */
export const MIX_ANALYSIS_MAX_LENGTH_MS = STUDIO_MAX_SONG_MS;

export type MixAnalysisFailure =
  | "no_audio"
  | "decode_failed"
  | "timeout"
  | "aborted"
  | "error";

export type MixAnalysisOutcome =
  | { ok: true; metrics: MixMetrics; verdict: MixVerdict; elapsedMs: number }
  /** `track` names the track whose audio did not load (decode_failed). */
  | { ok: false; reason: MixAnalysisFailure; track?: string };

/** A clip source could not be loaded: no verdict and no master without that track. */
export class MixSourceError extends Error {
  constructor(readonly track: string) {
    super("decode_failed");
    this.name = "MixSourceError";
  }
}

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
      stretchRatio: c.stretchRatio,
      pitchCents: c.pitchCents,
      scratchCueMs: c.scratchCueMs,
      scratchReverse: c.scratchReverse,
      scratchRate: c.scratchRate,
    });
  }
  const midiEnd = doc.tracks.reduce((max, t) => {
    const notes = t.midi?.notes ?? [];
    for (const n of notes) max = Math.max(max, n.t + n.dur);
    return max;
  }, 0);
  const contentEnd = Math.max(clips.reduce((m, c) => Math.max(m, c.timelineStartMs + c.durationMs), 0), midiEnd);
  return {
    sampleRate,
    lengthMs: Math.min(MIX_ANALYSIS_MAX_LENGTH_MS, Math.max(1000, Math.min(doc.project.timelineLengthMs || contentEnd, contentEnd || 1000))),
    masterGainDb: doc.project.masterGainDb,
    masterPan: doc.project.masterPan,
    tracks: doc.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.trackRole,
      trackType: t.trackType,
      gainDb: t.gainDb,
      pan: t.pan,
      muted: t.muted,
      solo: t.solo,
      // Track/master FX from the mix step (EQ, comp, de-esser, reverb/delay…): the
      // analysis, the browser preview and the E3 render all hear the processed sound.
      effectsChain: t.effectsChain,
      automation: t.automation,
      midi: t.midi,
    })),
    masterEffectsChain: doc.project.masterFxChain,
    markers: (doc.markers ?? []).map((m) => ({ kind: m.kind, positionMs: m.positionMs })),
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

/** Settles at once when `signal` aborts, even if the work itself hangs (a URL that never resolves). */
function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new DOMException("aborted", "AbortError"));
    if (signal.aborted) return stop();
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

/** Every heard source or MixSourceError (strict). Unheard clips (all muted) do not have to load. */
async function loadSources(
  doc: StudioProjectDocument,
  skeleton: ReturnType<typeof buildMixAnalysisSkeleton>,
  resolveSourceUrl: (clip: StudioClipDto) => Promise<string | null>,
  signal: AbortSignal,
  onDone: (fraction: number) => void,
  strict = true,
): Promise<Record<string, MixAnalysisSource>> {
  const sources: Record<string, MixAnalysisSource> = {};
  const muted = new Set(skeleton.tracks.filter((t) => t.muted).map((t) => t.id));
  let done = 0;
  for (const [key, clip] of skeleton.sourceClips) {
    const load = async () => {
      const url = await resolveSourceUrl(clip);
      return url ? decode(url, skeleton.sampleRate, signal) : null;
    };
    const decoded = await withAbort(load(), signal).catch((error) => {
      if (signal.aborted) throw error;
      return null;
    });
    if (decoded) sources[key] = decoded;
    else if (strict) {
      const heard = skeleton.clips.find((c) => c.sourceKey === key && !c.muted && !muted.has(c.trackId));
      if (heard) throw new MixSourceError(doc.tracks.find((t) => t.id === heard.trackId)?.name ?? "");
    }
    onDone(++done / skeleton.sourceClips.size);
  }
  return sources;
}

async function runInWorker(
  input: MixAnalysisInput,
  onProgress: (f: number) => void,
  signal: AbortSignal,
): Promise<MixMetrics> {
  const worker = await spawnStudioWorker("mixAnalysis");
  if (signal.aborted) {
    worker?.terminate();
    throw new DOMException("aborted", "AbortError");
  }
  // Main-thread fallback (no Worker support or the worker script failed to load).
  if (!worker) return computeMixMetrics(input, onProgress);
  return new Promise((resolve, reject) => {
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
 * to render the approved mix as one stereo track). Null when nothing decodes or it was aborted.
 */
export async function decodeMixAnalysisInput(params: {
  doc: StudioProjectDocument;
  resolveSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  sampleRate: number;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Throw MixSourceError when a heard track does not load (default: leave it out, the caller reports it). */
  strict?: boolean;
}): Promise<MixAnalysisInput | null> {
  const skeleton = buildMixAnalysisSkeleton(params.doc, params.sampleRate);
  let sources: Record<string, MixAnalysisSource>;
  try {
    sources = await loadSources(params.doc, skeleton, params.resolveSourceUrl, params.signal, (f) => params.onProgress?.(f), params.strict === true);
  } catch (error) {
    if (params.signal.aborted) return null;
    throw error;
  }
  if (Object.keys(sources).length === 0) return null;
  const { sourceClips: _unused, ...rest } = skeleton;
  void _unused;
  return { ...rest, sources, acousticBank: await preloadAcousticBank() };
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const progress = params.onProgress ?? (() => {});
  try {
    const skeleton = buildMixAnalysisSkeleton(params.doc);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, params.timeoutMs ?? mixAnalysisTimeoutMs(skeleton.clips));
    const hasNotes = skeleton.tracks.some((t) => (t.midi?.notes.length ?? 0) > 0);
    if (skeleton.sourceClips.size === 0 && !hasNotes) return { ok: false, reason: "no_audio" };
    const sources = await loadSources(params.doc, skeleton, params.resolveSourceUrl, controller.signal, (f) => progress(0.4 * f));
    if (Object.keys(sources).length === 0 && !hasNotes) return { ok: false, reason: "decode_failed" };
    const { sourceClips: _unused, ...rest } = skeleton;
    void _unused;
    const metrics = await runInWorker(
      { ...rest, sources, acousticBank: await preloadAcousticBank() },
      (f) => progress(0.4 + 0.6 * f),
      controller.signal,
    );
    return { ok: true, metrics, verdict: buildMixVerdict(metrics), elapsedMs: Date.now() - started };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: timedOut ? "timeout" : "aborted" };
    if (error instanceof MixSourceError) return { ok: false, reason: "decode_failed", track: error.track };
    return { ok: false, reason: "error" };
  } finally {
    if (timer) clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}
