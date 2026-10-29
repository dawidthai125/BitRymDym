/**
 * Stage 1 — pure offline render of Studio tracks for analysis.
 * Mirrors the engine mix path (clip gain + linear fades → track gain →
 * StereoPanner law → master gain/pan). Track/master FX chains are NOT
 * rendered (analysis is pre-FX); this is documented in the UI hint.
 */

import type { StudioTrackRole } from "@/config/studio";

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
};

export type MixAnalysisInput = {
  sampleRate: number;
  lengthMs: number;
  masterGainDb: number;
  masterPan: number;
  tracks: MixAnalysisTrack[];
  clips: MixAnalysisClip[];
  sources: Record<string, MixAnalysisSource>;
};

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

export function renderAllTracks(input: MixAnalysisInput): RenderedTrack[] {
  const anySolo = input.tracks.some((t) => t.solo);
  return input.tracks.map((t) => renderTrack(input, t, anySolo));
}

/** Sum audible tracks (optionally filtered) with master gain + pan. */
export function sumTracks(
  rendered: readonly RenderedTrack[],
  input: Pick<MixAnalysisInput, "masterGainDb" | "masterPan">,
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
    const g = dbToLin(input.masterGainDb);
    for (let i = 0; i < len; i++) {
      const [l, r] = stereoPan(left[i] * g, right[i] * g, false, input.masterPan);
      left[i] = l;
      right[i] = r;
    }
  }
  return { left, right };
}
