/**
 * Stage 3 — the approved mix rendered as ONE stereo track (same path as the
 * Mix analysis: clip gain/fades → track FX/gain/pan → master FX/gain/pan).
 * From here on BITEK sees and talks about the whole song.
 * `raw` = "Goły utwór": every unmuted track summed dry (no FX, no AI/user gain
 * or pan, no master chain), peak-normalised to -1 dBFS.
 */

import { analysisFxChain, applyFxInPlace, type MixAnalysisInput, renderTrack, stereoPanBuffer } from "@/lib/studio/mix-analysis/render";

import type { Stereo } from "./dsp";

export type RenderMixOptions = { raw?: boolean; normalize?: boolean; onlyTrackId?: string };

/** The input the track loop sees (raw = dry tracks, no master chain). */
export function prepareMixInput(input: MixAnalysisInput, opts: RenderMixOptions = {}): MixAnalysisInput {
  return opts.raw
    ? {
        ...input,
        masterEffectsChain: undefined,
        tracks: input.tracks
          .filter((t) => !opts.onlyTrackId || t.id === opts.onlyTrackId)
          .map((t) => ({ ...t, gainDb: 0, pan: 0, solo: false, muted: opts.onlyTrackId ? false : t.muted, effectsChain: undefined })),
      }
    : input;
}

export function mixLength(input: MixAnalysisInput): number {
  return Math.max(1, Math.round((input.lengthMs / 1000) * input.sampleRate));
}

/** After the track sum: raw normalise, or master FX → master gain/pan (in place). */
export function finishMixStereo(src: MixAnalysisInput, left: Float32Array, right: Float32Array, opts: RenderMixOptions = {}): Stereo {
  const sr = src.sampleRate;
  const len = left.length;
  if (opts.raw && opts.normalize === false) return { left, right, sampleRate: sr };
  if (opts.raw) {
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    const k = peak > 0 ? Math.min(1, Math.pow(10, -1 / 20) / peak) : 1;
    if (k !== 1) for (let i = 0; i < len; i++) { left[i] *= k; right[i] *= k; }
    return { left, right, sampleRate: sr };
  }
  const fx = analysisFxChain(src.masterEffectsChain, "master", sr);
  if (fx) applyFxInPlace(fx, left, right);
  const mg = Number.isFinite(src.masterGainDb) ? Math.pow(10, src.masterGainDb / 20) : 1;
  stereoPanBuffer(left, right, false, src.masterPan, mg);
  return { left, right, sampleRate: sr };
}

export function renderMixStereo(input: MixAnalysisInput, opts: RenderMixOptions = {}): Stereo {
  const len = mixLength(input);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const src = prepareMixInput(input, opts);
  const anySolo = src.tracks.some((t) => t.solo);
  for (const t of src.tracks) {
    const r = renderTrack(src, t, anySolo);
    if (!r.audible || r.activeRanges.length === 0) continue;
    for (let i = 0; i < len; i++) {
      left[i] += r.left[i];
      right[i] += r.right[i];
    }
  }
  return finishMixStereo(src, left, right, opts);
}
