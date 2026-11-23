/**
 * Stage 1 — pure offline render of Studio tracks for analysis.
 * Mirrors the engine mix path (clip gain + linear fades → track gain →
 * track FX → StereoPanner law → master FX → master gain/pan).
 * Stage 2: track/master FX chains are rendered with the SAME offline DSP as
 * the E3 render (studio-offline-fx), so re-analysis after BITEK fixes
 * reflects the processed sound. Unsupported chains fall back to dry.
 */

import { automationLane, clampAutomationValue, createLaneEvaluator, type StudioAutomationV1 } from "@/lib/studio/studio-automation";
import type { AcousticBank } from "@/lib/studio/acoustic-bank";
import {
  bakedReverseTimelineMs,
  bakedTimelineMs,
  clampClipPlayback,
  clipPlaybackIdentity,
  renderClipPlaybackMono,
} from "@/lib/studio/studio-clip-playback";
import { renderMidiNotes, type StudioMidiV1 } from "@/lib/studio/studio-midi";
import { resolveScratchSourceMs } from "@/lib/studio/studio-scratch-state";
import type { StudioTrackRole } from "@/config/studio";
import {
  buildStudioOfflineFxChain,
  type StudioOfflineFxChainHandle,
} from "@/lib/studio/studio-offline-fx";

export type MixAnalysisSource = {
  /** 1 or 2 channels at `sampleRate`. */
  channels: Float32Array[];
};

export type MixAnalysisClip = {
  trackId: string;
  sourceKey: string;
  sourceOffsetMs: number;
  timelineStartMs: number;
  durationMs: number;
  gainDb: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  /** Clip tempo / pitch (baked like playback and export). Absent = original. */
  stretchRatio?: number;
  pitchCents?: number;
  /** Approved Scratch DJ fields / „Odwróć”. Absent = plain forward read. */
  scratchCueMs?: number;
  scratchReverse?: boolean;
  scratchRate?: number;
};

export type MixAnalysisTrack = {
  id: string;
  name: string;
  role: StudioTrackRole;
  /** BEAT keys the user sidechain (same rule as the live engine). */
  trackType?: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  /** Raw track FX chain (JSONB v1). Omitted / empty = dry. */
  effectsChain?: unknown;
  /** Silver/Gold gain / pan envelopes; absent = static gainDb / pan. */
  automation?: StudioAutomationV1;
  /** Timeline notes (ms from 0). Mixed like clip audio: mute, solo, gain, pan. */
  midi?: StudioMidiV1;
};

export type MixAnalysisInput = {
  sampleRate: number;
  lengthMs: number;
  masterGainDb: number;
  masterPan: number;
  tracks: MixAnalysisTrack[];
  clips: MixAnalysisClip[];
  sources: Record<string, MixAnalysisSource>;
  /** Raw master FX chain (JSONB v1). Applied before master gain/pan. */
  masterEffectsChain?: unknown;
  /** Verse / hook points. The rap pocket reads them at mix sum. */
  markers?: Array<{ kind: "verse" | "hook"; positionMs: number }>;
  /** Recorded piano, guitar, and bass. Absent keeps the synthesizer. */
  acousticBank?: AcousticBank | null;
};

/** Offline FX chain for analysis; any failure → null (dry, never throws). */
export function analysisFxChain(
  raw: unknown,
  role: "track" | "master",
  sampleRate: number,
): StudioOfflineFxChainHandle | null {
  if (raw == null) return null;
  try {
    return buildStudioOfflineFxChain(raw, role, sampleRate);
  } catch {
    return null;
  }
}

/** In-place stereo FX over whole buffers. */
export function applyFxInPlace(
  chain: StudioOfflineFxChainHandle,
  left: Float32Array,
  right: Float32Array,
): void {
  chain.processBuffer(left, right);
}

export type RenderedTrack = {
  track: MixAnalysisTrack;
  left: Float32Array;
  right: Float32Array;
  /** Sample ranges [start, end) covered by unmuted clips. */
  activeRanges: Array<[number, number]>;
  audible: boolean;
};

const dbToLin = (db: number) => (Number.isFinite(db) ? Math.pow(10, db / 20) : 1);

/** Web Audio StereoPannerNode law (spec, equal power). */
export function stereoPan(
  l: number,
  r: number,
  mono: boolean,
  pan: number,
): [number, number] {
  const p = Math.max(-1, Math.min(1, pan || 0));
  if (mono) {
    const x = (p + 1) / 2;
    return [l * Math.cos((x * Math.PI) / 2), l * Math.sin((x * Math.PI) / 2)];
  }
  if (p <= 0) {
    const x = p + 1;
    return [l + r * Math.cos((x * Math.PI) / 2), r * Math.sin((x * Math.PI) / 2)];
  }
  const x = p;
  return [l * Math.cos((x * Math.PI) / 2), r + l * Math.sin((x * Math.PI) / 2)];
}

/**
 * In place: (left·gain, right·gain) → stereoPan over whole buffers. Same math as
 * stereoPan per sample (the cos/sin factors are computed once).
 */
export function stereoPanBuffer(left: Float32Array, right: Float32Array, mono: boolean, pan: number, gain = 1): void {
  const p = Math.max(-1, Math.min(1, pan || 0));
  const len = Math.min(left.length, right.length);
  if (mono) {
    const x = (p + 1) / 2;
    const cl = Math.cos((x * Math.PI) / 2), sr = Math.sin((x * Math.PI) / 2);
    for (let i = 0; i < len; i++) {
      const l = left[i] * gain;
      left[i] = l * cl;
      right[i] = l * sr;
    }
    return;
  }
  if (p <= 0) {
    const x = p + 1;
    const c = Math.cos((x * Math.PI) / 2), sn = Math.sin((x * Math.PI) / 2);
    for (let i = 0; i < len; i++) {
      const l = left[i] * gain, r = right[i] * gain;
      left[i] = l + r * c;
      right[i] = r * sn;
    }
    return;
  }
  const c = Math.cos((p * Math.PI) / 2), sn = Math.sin((p * Math.PI) / 2);
  for (let i = 0; i < len; i++) {
    const l = left[i] * gain, r = right[i] * gain;
    left[i] = l * c;
    right[i] = r + l * sn;
  }
}

/** Per-sample gain (linear) and pan evaluators for a track: constants when it has no automation. */
function trackStrip(track: MixAnalysisTrack, sr: number): { gainAt: (n: number) => number; panAt: (n: number) => number; automated: boolean } {
  const gLane = automationLane(track.automation, "gainDb");
  const pLane = automationLane(track.automation, "pan");
  const tg = dbToLin(track.gainDb);
  if (!gLane && !pLane) return { gainAt: () => tg, panAt: () => track.pan, automated: false };
  const gEval = gLane ? createLaneEvaluator(gLane.points, track.gainDb) : null;
  const pEval = pLane ? createLaneEvaluator(pLane.points, track.pan) : null;
  const msPerSample = 1000 / sr;
  return {
    gainAt: gEval ? (n) => dbToLin(clampAutomationValue("gainDb", gEval(n * msPerSample))) : () => tg,
    panAt: pEval ? (n) => clampAutomationValue("pan", pEval(n * msPerSample)) : () => track.pan,
    automated: true,
  };
}

/** Stretch + pitch bakes, one per source and setting (a looped sample reuses the same bake). */
const bakedSources = new WeakMap<MixAnalysisSource, Map<string, Float32Array[]>>();

function bakedChannels(src: MixAnalysisSource, playback: { stretch: number; pitchCents: number }): Float32Array[] {
  const sig = `${playback.stretch}|${playback.pitchCents}`;
  let bySig = bakedSources.get(src);
  if (!bySig) {
    bySig = new Map();
    bakedSources.set(src, bySig);
  }
  let hit = bySig.get(sig);
  if (!hit) {
    hit = src.channels.slice(0, 2).map((ch) => renderClipPlaybackMono(ch, playback));
    bySig.set(sig, hit);
  }
  return hit;
}

type ClipPcm = {
  c0: Float32Array;
  c1: Float32Array;
  mono: boolean;
  /** Clip-local sample → source sample. Outside the source = silence. */
  indexAt: (k: number) => number;
  /** Samples left in a plain forward source; Infinity when the read position is mapped. */
  available: number;
};

/** The clip's samples the way playback reads them: tempo, pitch, reverse and approved scratch included. */
function clipPcm(input: MixAnalysisInput, clip: MixAnalysisClip): ClipPcm | null {
  const src = input.sources[clip.sourceKey];
  if (!src || src.channels.length === 0) return null;
  const sr = input.sampleRate;
  const playback = clampClipPlayback({ stretch: clip.stretchRatio ?? 1, pitchCents: clip.pitchCents ?? 0 });
  const shaped = !clipPlaybackIdentity(playback);
  const channels = shaped ? bakedChannels(src, playback) : src.channels;
  const mono = channels.length === 1;
  const c0 = channels[0];
  const c1 = mono ? c0 : channels[1];
  const reverse = Boolean(clip.scratchReverse);
  const cueMs = clip.scratchCueMs ?? 0;
  const rate = clip.scratchRate ?? 1;
  const sourceDurationMs = (c0.length / sr) * 1000;
  // Same rounding as the export: floor(ms → frame); the epsilon keeps whole frames whole.
  const frame = (ms: number) => Math.floor((ms / 1000) * sr + 1e-5);
  if (!shaped && !reverse && cueMs === 0 && rate === 1) {
    const off = Math.round((clip.sourceOffsetMs / 1000) * sr);
    return { c0, c1, mono, indexAt: (k) => off + k, available: c0.length - off };
  }
  const local = (k: number) => (k / sr) * 1000;
  const indexAt = shaped
    ? reverse
      ? (k: number) =>
          frame(bakedReverseTimelineMs({ sourceOffsetMs: clip.sourceOffsetMs, localMs: local(k), stretch: playback.stretch, cueMs, rate, bakedDurationMs: sourceDurationMs }))
      : (k: number) => frame(bakedTimelineMs({ sourceOffsetMs: clip.sourceOffsetMs, localMs: local(k), stretch: playback.stretch }))
    : (k: number) =>
        frame(resolveScratchSourceMs({ sourceOffsetMs: clip.sourceOffsetMs, localMs: local(k), approved: { cueMs, reverse, rate }, sourceDurationMs }));
  return { c0, c1, mono, indexAt, available: Infinity };
}

/** Overlap-add is inside renderMidiNotes. Gain here; pan now or later (FX path pans the whole bus). */
function addRenderedMidi(
  input: MixAnalysisInput,
  track: MixAnalysisTrack,
  left: Float32Array,
  right: Float32Array,
  activeRanges: Array<[number, number]>,
  strip: { gainAt: (n: number) => number; panAt: (n: number) => number },
  panNow: boolean,
): void {
  const midi = track.midi;
  if (!midi || midi.notes.length === 0) return;
  const pcm = renderMidiNotes({
    notes: midi.notes,
    instrument: midi.instrument,
    sampleRate: input.sampleRate,
    durationMs: input.lengthMs,
    bank: input.acousticBank,
  });
  const nMax = Math.min(left.length, right.length, pcm.length);
  let start = -1;
  let end = 0;
  for (let n = 0; n < nMax; n++) {
    const s = pcm[n];
    if (s === 0) continue;
    if (start < 0) start = n;
    end = n + 1;
    const g = s * strip.gainAt(n);
    if (panNow) {
      const [pl, pr] = stereoPan(g, g, true, strip.panAt(n));
      left[n] += pl;
      right[n] += pr;
    } else {
      left[n] += g;
      right[n] += g;
    }
  }
  if (start >= 0) activeRanges.push([start, end]);
}

export function renderTrack(input: MixAnalysisInput, track: MixAnalysisTrack, anySolo: boolean): RenderedTrack {
  const sr = input.sampleRate;
  const len = Math.max(1, Math.round((input.lengthMs / 1000) * sr));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const activeRanges: Array<[number, number]> = [];
  const audible = !track.muted && (!anySolo || track.solo);
  const strip = trackStrip(track, sr);
  const fx = analysisFxChain(track.effectsChain, "track", sr);
  if (fx) return renderTrackWithFx(input, track, audible, strip, fx);
  for (const clip of input.clips) {
    if (clip.trackId !== track.id || clip.muted || clip.durationMs < 1) continue;
    const pcm = clipPcm(input, clip);
    if (!pcm) continue;
    const { c0, c1, mono, indexAt } = pcm;
    const start = Math.round((clip.timelineStartMs / 1000) * sr);
    const dur = Math.round((clip.durationMs / 1000) * sr);
    const fi = Math.round((Math.max(0, clip.fadeInMs) / 1000) * sr);
    const fo = Math.round((Math.max(0, clip.fadeOutMs) / 1000) * sr);
    const cg = dbToLin(clip.gainDb);
    const end = Math.min(len, start + dur, start + pcm.available);
    if (end <= start) continue;
    let first = -1;
    let last = -1;
    for (let n = Math.max(0, start); n < end; n++) {
      const k = n - start;
      const si = indexAt(k);
      if (si < 0 || si >= c0.length) continue;
      if (first < 0) first = n;
      last = n;
      let g = cg * strip.gainAt(n);
      if (fi > 0 && k < fi) g *= k / fi;
      if (fo > 0 && dur - k <= fo) g *= Math.max(0, (dur - k) / fo);
      const [pl, pr] = stereoPan(c0[si] * g, c1[si] * g, mono, strip.panAt(n));
      left[n] += pl;
      right[n] += pr;
    }
    if (first >= 0) activeRanges.push([first, last + 1]);
  }
  addRenderedMidi(input, track, left, right, activeRanges, strip, true);
  return { track, left, right, activeRanges, audible };
}

/** gain → FX (unpanned stereo) → pan, matching the live track strip. */
function renderTrackWithFx(
  input: MixAnalysisInput,
  track: MixAnalysisTrack,
  audible: boolean,
  strip: { gainAt: (n: number) => number; panAt: (n: number) => number; automated: boolean },
  fx: StudioOfflineFxChainHandle,
): RenderedTrack {
  const sr = input.sampleRate;
  const len = Math.max(1, Math.round((input.lengthMs / 1000) * sr));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const activeRanges: Array<[number, number]> = [];
  let allMono = true;
  for (const clip of input.clips) {
    if (clip.trackId !== track.id || clip.muted || clip.durationMs < 1) continue;
    const pcm = clipPcm(input, clip);
    if (!pcm) continue;
    const { c0, c1, mono, indexAt } = pcm;
    if (!mono) allMono = false;
    const start = Math.round((clip.timelineStartMs / 1000) * sr);
    const dur = Math.round((clip.durationMs / 1000) * sr);
    const fi = Math.round((Math.max(0, clip.fadeInMs) / 1000) * sr);
    const fo = Math.round((Math.max(0, clip.fadeOutMs) / 1000) * sr);
    const cg = dbToLin(clip.gainDb);
    const end = Math.min(len, start + dur, start + pcm.available);
    if (end <= start) continue;
    let first = -1;
    let last = -1;
    for (let n = Math.max(0, start); n < end; n++) {
      const k = n - start;
      const si = indexAt(k);
      if (si < 0 || si >= c0.length) continue;
      if (first < 0) first = n;
      last = n;
      let g = cg * strip.gainAt(n);
      if (fi > 0 && k < fi) g *= k / fi;
      if (fo > 0 && dur - k <= fo) g *= Math.max(0, (dur - k) / fo);
      left[n] += c0[si] * g;
      right[n] += c1[si] * g;
    }
    if (first >= 0) activeRanges.push([first, last + 1]);
  }
  addRenderedMidi(input, track, left, right, activeRanges, strip, false);
  if (activeRanges.length > 0) applyFxInPlace(fx, left, right);
  // Reverb (stereo IR) turns a mono strip stereo before the panner.
  const stereoFx = fx.processors.some((p) => p.type === "reverb" && p.status === "IMPLEMENTED");
  const mono = allMono && !stereoFx;
  if (strip.automated) {
    // Pan automation after the FX: per-sample pan, same law as stereoPan.
    const len2 = Math.min(left.length, right.length);
    for (let n = 0; n < len2; n++) {
      const [pl, pr] = stereoPan(left[n], right[n], mono, strip.panAt(n));
      left[n] = pl;
      right[n] = pr;
    }
  } else {
    stereoPanBuffer(left, right, mono, track.pan);
  }
  return { track, left, right, activeRanges, audible };
}

export function renderAllTracks(input: MixAnalysisInput): RenderedTrack[] {
  const anySolo = input.tracks.some((t) => t.solo);
  return input.tracks.map((t) => renderTrack(input, t, anySolo));
}

/** Sum audible tracks (optionally filtered) with master gain + pan. */
export function sumTracks(
  rendered: readonly RenderedTrack[],
  input: Pick<MixAnalysisInput, "masterGainDb" | "masterPan"> &
    Partial<Pick<MixAnalysisInput, "masterEffectsChain" | "sampleRate">>,
  filter: (t: RenderedTrack) => boolean = () => true,
  applyMaster = true,
): { left: Float32Array; right: Float32Array } {
  const len = rendered[0]?.left.length ?? 0;
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for (const r of rendered) {
    if (!r.audible || !filter(r)) continue;
    for (let i = 0; i < len; i++) {
      left[i] += r.left[i];
      right[i] += r.right[i];
    }
  }
  if (applyMaster) {
    const mfx = input.sampleRate
      ? analysisFxChain(input.masterEffectsChain, "master", input.sampleRate)
      : null;
    if (mfx) applyFxInPlace(mfx, left, right);
    const g = dbToLin(input.masterGainDb);
    for (let i = 0; i < len; i++) {
      const [l, r] = stereoPan(left[i] * g, right[i] * g, false, input.masterPan);
      left[i] = l;
      right[i] = r;
    }
  }
  return { left, right };
}
