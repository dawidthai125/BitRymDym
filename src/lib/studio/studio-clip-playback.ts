/**
 * Clip time-stretch and pitch that do not ride on the scratch jog.
 * Stretch 1 keeps length. 2 is half speed (twice as long), pitch stays.
 * Cents change pitch and keep the stretched length.
 * Identity (stretch 1, 0 cents) returns the same samples.
 */

import { resolveScratchSourceMs } from "@/lib/studio/studio-scratch-state";

export const CLIP_STRETCH_MIN = 0.5;
export const CLIP_STRETCH_MAX = 2;
export const CLIP_PITCH_CENTS_MIN = -1200;
export const CLIP_PITCH_CENTS_MAX = 1200;

export type ClipPlayback = {
  stretch: number;
  pitchCents: number;
};

export function clipPlaybackIdentity(playback: ClipPlayback): boolean {
  return playback.stretch === 1 && playback.pitchCents === 0;
}

export function clampClipPlayback(raw: {
  stretch?: number | null;
  pitchCents?: number | null;
}): ClipPlayback {
  const stretch = Number.isFinite(raw.stretch) ? Number(raw.stretch) : 1;
  const pitchCents = Number.isFinite(raw.pitchCents) ? Number(raw.pitchCents) : 0;
  return {
    stretch: Math.min(CLIP_STRETCH_MAX, Math.max(CLIP_STRETCH_MIN, stretch)),
    pitchCents: Math.round(
      Math.min(CLIP_PITCH_CENTS_MAX, Math.max(CLIP_PITCH_CENTS_MIN, pitchCents)),
    ),
  };
}

/** Parse a write. Null fields mean "leave the stored value". */
export function parseClipPlaybackWrite(input: {
  stretch: unknown;
  pitchCents: unknown;
}): ClipPlayback {
  if (typeof input.stretch !== "number" || !Number.isFinite(input.stretch)) {
    throw new Error("stretch must be a finite number.");
  }
  if (typeof input.pitchCents !== "number" || !Number.isFinite(input.pitchCents)) {
    throw new Error("pitchCents must be a finite number.");
  }
  const next = clampClipPlayback({ stretch: input.stretch, pitchCents: input.pitchCents });
  if (next.stretch !== input.stretch && (input.stretch < CLIP_STRETCH_MIN || input.stretch > CLIP_STRETCH_MAX)) {
    throw new Error("stretch out of range.");
  }
  if (
    next.pitchCents !== Math.round(input.pitchCents) ||
    input.pitchCents < CLIP_PITCH_CENTS_MIN ||
    input.pitchCents > CLIP_PITCH_CENTS_MAX
  ) {
    throw new Error("pitchCents out of range.");
  }
  return next;
}

function resampleLinear(input: Float32Array, outputLength: number): Float32Array {
  const out = new Float32Array(Math.max(1, outputLength));
  if (input.length === 0) return out;
  if (input.length === 1 || out.length === 1) {
    out.fill(input[0] ?? 0);
    return out;
  }
  const scale = (input.length - 1) / (out.length - 1);
  for (let i = 0; i < out.length; i++) {
    const pos = i * scale;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const f = pos - i0;
    out[i] = (input[i0] ?? 0) * (1 - f) + (input[i1] ?? 0) * f;
  }
  return out;
}

function hann(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, length - 1));
  }
  return w;
}

/** Overlap-add to a new length. Short buffers fall back to linear resample. */
export function olaStretch(input: Float32Array, outputLength: number): Float32Array {
  const target = Math.max(1, outputLength);
  if (input.length === target) return input;
  if (input.length < 1024 || target < 1024) return resampleLinear(input, target);
  const grain = 1024;
  const hopIn = 256;
  const ratio = target / input.length;
  const hopOut = Math.max(1, Math.round(hopIn * ratio));
  const window = hann(grain);
  const out = new Float32Array(target);
  const norm = new Float32Array(target);
  let inPos = 0;
  let outPos = 0;
  while (inPos + grain <= input.length && outPos + grain <= target) {
    for (let i = 0; i < grain; i++) {
      const w = window[i] ?? 0;
      out[outPos + i] += (input[inPos + i] ?? 0) * w;
      norm[outPos + i] += w;
    }
    inPos += hopIn;
    outPos += hopOut;
  }
  for (let i = 0; i < target; i++) {
    const n = norm[i] ?? 0;
    if (n > 1e-6) out[i] = (out[i] ?? 0) / n;
  }
  return out;
}

function pitchKeepLength(input: Float32Array, cents: number): Float32Array {
  if (cents === 0 || input.length < 2) return input;
  const factor = 2 ** (cents / 1200);
  const pitched = resampleLinear(input, Math.max(1, Math.round(input.length / factor)));
  return olaStretch(pitched, input.length);
}

export function renderClipPlaybackMono(input: Float32Array, playback: ClipPlayback): Float32Array {
  const next = clampClipPlayback(playback);
  if (clipPlaybackIdentity(next)) return input;
  const pitched = pitchKeepLength(input, next.pitchCents);
  const stretched = Math.max(1, Math.round(pitched.length * next.stretch));
  return olaStretch(pitched, stretched);
}

export type StereoPcm = { frames: number; interleaved: Float32Array };

/** Stereo interleaved. Output frame count is round(frames * stretch). */
export function renderClipPlaybackStereo(pcm: StereoPcm, playback: ClipPlayback): StereoPcm {
  const next = clampClipPlayback(playback);
  if (clipPlaybackIdentity(next) || pcm.frames < 1) return pcm;
  const left = new Float32Array(pcm.frames);
  const right = new Float32Array(pcm.frames);
  for (let i = 0; i < pcm.frames; i++) {
    left[i] = pcm.interleaved[i * 2] ?? 0;
    right[i] = pcm.interleaved[i * 2 + 1] ?? 0;
  }
  const outL = renderClipPlaybackMono(left, next);
  const outR = renderClipPlaybackMono(right, next);
  const frames = Math.min(outL.length, outR.length);
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = outL[i] ?? 0;
    interleaved[i * 2 + 1] = outR[i] ?? 0;
  }
  return { frames, interleaved };
}

/**
 * Where to read a baked buffer. Stretch is already inside the bake,
 * so one timeline millisecond is one baked millisecond.
 * Offset is the original source offset, scaled into the bake.
 */
export function bakedTimelineMs(params: {
  sourceOffsetMs: number;
  localMs: number;
  stretch: number;
}): number {
  const stretch = clampClipPlayback({ stretch: params.stretch, pitchCents: 0 }).stretch;
  const offset = Number.isFinite(params.sourceOffsetMs) ? params.sourceOffsetMs : 0;
  const local = Number.isFinite(params.localMs) ? params.localMs : 0;
  return offset * stretch + local;
}

/**
 * Read position in a stretch and pitch bake when the clip is also reversed.
 * The bake already holds stretch and pitch. Reverse walks that bake backward.
 * Stretch 1 matches resolveScratchSourceMs on the original file.
 */
export function bakedReverseTimelineMs(params: {
  sourceOffsetMs: number;
  localMs: number;
  stretch: number;
  cueMs: number;
  rate: number;
  bakedDurationMs: number;
}): number {
  const stretch = clampClipPlayback({ stretch: params.stretch, pitchCents: 0 }).stretch;
  const cue = Number.isFinite(params.cueMs) ? params.cueMs : 0;
  return resolveScratchSourceMs({
    sourceOffsetMs: (Number.isFinite(params.sourceOffsetMs) ? params.sourceOffsetMs : 0) * stretch,
    localMs: params.localMs,
    approved: {
      cueMs: cue * stretch,
      reverse: true,
      rate: params.rate,
    },
    sourceDurationMs: params.bakedDurationMs,
  });
}
