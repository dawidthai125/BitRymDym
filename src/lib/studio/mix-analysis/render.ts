/**
 * Stage 1 — pure offline render of Studio tracks for analysis.
 * Mirrors the engine mix path (clip gain + linear fades → track gain →
 * track FX → StereoPanner law → master FX → master gain/pan).
 * Stage 2: track/master FX chains are rendered with the SAME offline DSP as
 * the E3 render (studio-offline-fx), so re-analysis after BITEK fixes
 * reflects the processed sound. Unsupported chains fall back to dry.
 */

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
};

export type MixAnalysisTrack = {
  id: string;
  name: string;
  role: StudioTrackRole;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  /** Raw track FX chain (JSONB v1). Omitted / empty = dry. */
  effectsChain?: unknown;
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
  const sample = { left: 0, right: 0 };
  for (let i = 0; i < left.length; i++) {
    sample.left = left[i];
    sample.right = right[i];
    const out = chain.process(sample);
    left[i] = out.left;
    right[i] = out.right;
  }
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

export function renderTrack(input: MixAnalysisInput, track: MixAnalysisTrack, anySolo: boolean): RenderedTrack {
  const sr = input.sampleRate;
  const len = Math.max(1, Math.round((input.lengthMs / 1000) * sr));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const activeRanges: Array<[number, number]> = [];
  const audible = !track.muted && (!anySolo || track.solo);
  const tg = dbToLin(track.gainDb);
  const fx = analysisFxChain(track.effectsChain, "track", sr);
  if (fx) return renderTrackWithFx(input, track, audible, tg, fx);
  for (const clip of input.clips) {
    if (clip.trackId !== track.id || clip.muted || clip.durationMs < 1) continue;
    const src = input.sources[clip.sourceKey];
    if (!src || src.channels.length === 0) continue;
    const mono = src.channels.length === 1;
    const c0 = src.channels[0];
    const c1 = mono ? c0 : src.channels[1];
    const start = Math.round((clip.timelineStartMs / 1000) * sr);
    const dur = Math.round((clip.durationMs / 1000) * sr);
    const off = Math.round((clip.sourceOffsetMs / 1000) * sr);
    const fi = Math.round((Math.max(0, clip.fadeInMs) / 1000) * sr);
    const fo = Math.round((Math.max(0, clip.fadeOutMs) / 1000) * sr);
    const cg = dbToLin(clip.gainDb) * tg;
    const end = Math.min(len, start + dur, start + (c0.length - off));
    if (end <= start) continue;
    activeRanges.push([Math.max(0, start), end]);
    for (let n = Math.max(0, start); n < end; n++) {
      const k = n - start;
      const si = off + k;
      if (si < 0) continue;
      let g = cg;
      if (fi > 0 && k < fi) g *= k / fi;
      if (fo > 0 && dur - k <= fo) g *= Math.max(0, (dur - k) / fo);
      const [pl, pr] = stereoPan(c0[si] * g, c1[si] * g, mono, track.pan);
      left[n] += pl;
      right[n] += pr;
    }
  }
  return { track, left, right, activeRanges, audible };
}

/** gain → FX (unpanned stereo) → pan, matching the live track strip. */
function renderTrackWithFx(
  input: MixAnalysisInput,
  track: MixAnalysisTrack,
  audible: boolean,
  tg: number,
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
    const src = input.sources[clip.sourceKey];
    if (!src || src.channels.length === 0) continue;
    const mono = src.channels.length === 1;
    if (!mono) allMono = false;
    const c0 = src.channels[0];
    const c1 = mono ? c0 : src.channels[1];
    const start = Math.round((clip.timelineStartMs / 1000) * sr);
    const dur = Math.round((clip.durationMs / 1000) * sr);
    const off = Math.round((clip.sourceOffsetMs / 1000) * sr);
    const fi = Math.round((Math.max(0, clip.fadeInMs) / 1000) * sr);
    const fo = Math.round((Math.max(0, clip.fadeOutMs) / 1000) * sr);
    const cg = dbToLin(clip.gainDb) * tg;
    const end = Math.min(len, start + dur, start + (c0.length - off));
    if (end <= start) continue;
    activeRanges.push([Math.max(0, start), end]);
    for (let n = Math.max(0, start); n < end; n++) {
      const k = n - start;
      const si = off + k;
      if (si < 0) continue;
      let g = cg;
      if (fi > 0 && k < fi) g *= k / fi;
      if (fo > 0 && dur - k <= fo) g *= Math.max(0, (dur - k) / fo);
      left[n] += c0[si] * g;
      right[n] += c1[si] * g;
    }
  }
  if (activeRanges.length > 0) applyFxInPlace(fx, left, right);
  // Reverb (stereo IR) turns a mono strip stereo before the panner.
  const stereoFx = fx.processors.some((p) => p.type === "reverb" && p.status === "IMPLEMENTED");
  const mono = allMono && !stereoFx;
  for (let i = 0; i < len; i++) {
    const [pl, pr] = stereoPan(left[i], right[i], mono, track.pan);
    left[i] = pl;
    right[i] = pr;
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
