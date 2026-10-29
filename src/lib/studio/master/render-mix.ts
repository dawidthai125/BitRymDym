/**
 * Stage 3 — the approved mix rendered as ONE stereo track (same path as the
 * Mix analysis: clip gain/fades → track FX/gain/pan → master FX/gain/pan).
 * From here on BITEK sees and talks about the whole song.
 * `raw` = "Goły utwór": every unmuted track summed dry (no FX, no AI/user gain
 * or pan, no master chain), peak-normalised to -1 dBFS.
 */

import { analysisFxChain, applyFxInPlace, type MixAnalysisInput, renderTrack, stereoPan } from "@/lib/studio/mix-analysis/render";

import type { Stereo } from "./dsp";

export function renderMixStereo(input: MixAnalysisInput, opts: { raw?: boolean; normalize?: boolean; onlyTrackId?: string } = {}): Stereo {
  const sr = input.sampleRate;
  const len = Math.max(1, Math.round((input.lengthMs / 1000) * sr));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const src: MixAnalysisInput = opts.raw
    ? {
        ...input,
        masterEffectsChain: undefined,
        tracks: input.tracks
          .filter((t) => !opts.onlyTrackId || t.id === opts.onlyTrackId)
          .map((t) => ({ ...t, gainDb: 0, pan: 0, solo: false, muted: opts.onlyTrackId ? false : t.muted, effectsChain: undefined })),
      }
    : input;
  const anySolo = src.tracks.some((t) => t.solo);
  for (const t of src.tracks) {
    const r = renderTrack(src, t, anySolo);
    if (!r.audible || r.activeRanges.length === 0) continue;
    for (let i = 0; i < len; i++) {
      left[i] += r.left[i];
      right[i] += r.right[i];
    }
  }
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
  for (let i = 0; i < len; i++) {
    const [l, r] = stereoPan(left[i] * mg, right[i] * mg, false, src.masterPan);
    left[i] = l;
    right[i] = r;
  }
  return { left, right, sampleRate: sr };
}
