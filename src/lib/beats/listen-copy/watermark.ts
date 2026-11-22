/**
 * Per-account inaudible watermark for the Studio / recording / Windows listen copy (Owner 2026-11-22).
 *
 * Embed: a pseudo-random ±1 sequence seeded by the copy id, band-limited (~1.4–5.5 kHz), scaled to follow the
 * music's own loudness at about -44 dB under it, added identically to every channel.
 * Detect (non-blind): align the leaked file to the clean master, subtract it, and correlate what is left with
 * each candidate copy's sequence. The wrong copies give a z-score near 0, the right one a very large z.
 *
 * Pure: no IO. Audio is mono or interleaved Float32 at one sample rate (44.1 kHz in practice).
 */

export const WATERMARK_STRENGTH_DB = -44;
const CHIP = 4;
const HIGHPASS_WINDOW = 32;
const ENV_BLOCK = 1024;
const ENV_FLOOR = 1e-4;

/** FNV-1a of the copy id → non-zero 32-bit seed. */
export function watermarkSeed(copyId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < copyId.length; i++) {
    h ^= copyId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 0x9e3779b9;
}

/** Band-limited ±1 sequence of `length` samples (unit RMS) for this seed. */
export function watermarkPattern(seed: number, length: number): Float32Array {
  const raw = new Float32Array(length);
  let x = seed >>> 0 || 1;
  let chip = 1;
  for (let i = 0; i < length; i++) {
    if (i % CHIP === 0) {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      chip = x & 1 ? 1 : -1;
    }
    raw[i] = chip;
  }
  // High-pass: subtract a running mean so the energy sits above the kick and bass.
  const out = new Float32Array(length);
  let acc = 0;
  for (let i = 0; i < length; i++) {
    acc += raw[i];
    if (i >= HIGHPASS_WINDOW) acc -= raw[i - HIGHPASS_WINDOW];
    out[i] = raw[i] - acc / Math.min(i + 1, HIGHPASS_WINDOW);
  }
  let energy = 0;
  for (let i = 0; i < length; i++) energy += out[i] * out[i];
  const rms = Math.sqrt(energy / Math.max(1, length)) || 1;
  for (let i = 0; i < length; i++) out[i] /= rms;
  return out;
}

/** Interleaved → mono average. */
export function toMono(samples: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += samples[f * channels + c];
    mono[f] = s / channels;
  }
  return mono;
}

/** Per-frame loudness of the music (block RMS, spread to neighbours so transients stay masked). */
export function loudnessEnvelope(mono: Float32Array): Float32Array {
  const blocks = Math.ceil(mono.length / ENV_BLOCK);
  const rms = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    let e = 0;
    const start = b * ENV_BLOCK;
    const end = Math.min(mono.length, start + ENV_BLOCK);
    for (let i = start; i < end; i++) e += mono[i] * mono[i];
    rms[b] = Math.sqrt(e / Math.max(1, end - start));
  }
  const env = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const b = Math.floor(i / ENV_BLOCK);
    // Take the quieter of the block and its neighbours: the mark never pokes out of a fade or a gap.
    const prev = rms[Math.max(0, b - 1)];
    const next = rms[Math.min(blocks - 1, b + 1)];
    env[i] = Math.max(ENV_FLOOR, Math.min(rms[b], prev, next));
  }
  return env;
}

/** The exact signal added for this copy (mono, per frame). Detection recomputes it from the clean master. */
export function watermarkSignal(masterMono: Float32Array, copyId: string, strengthDb = WATERMARK_STRENGTH_DB): Float32Array {
  const gain = Math.pow(10, strengthDb / 20);
  const env = loudnessEnvelope(masterMono);
  const pattern = watermarkPattern(watermarkSeed(copyId), masterMono.length);
  const out = new Float32Array(masterMono.length);
  for (let i = 0; i < out.length; i++) out[i] = gain * env[i] * pattern[i];
  return out;
}

/** Returns a new interleaved buffer with the mark added to every channel (clamped to ±1). */
export function embedWatermark(
  samples: Float32Array,
  channels: number,
  copyId: string,
  strengthDb = WATERMARK_STRENGTH_DB,
): Float32Array {
  const mark = watermarkSignal(toMono(samples, channels), copyId, strengthDb);
  const out = new Float32Array(samples.length);
  for (let f = 0; f < mark.length; f++) {
    for (let c = 0; c < channels; c++) {
      const i = f * channels + c;
      const v = samples[i] + mark[f];
      out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }
  return out;
}

function dot(a: Float32Array, aOff: number, b: Float32Array, bOff: number, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[aOff + i] * b[bOff + i];
  return s;
}

function decimateAbs(x: Float32Array, factor: number): Float32Array {
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += Math.abs(x[i * factor + k]);
    out[i] = s / factor;
  }
  return out;
}

/**
 * Offset (in samples) such that suspect[i + offset] ≈ master[i]. Coarse search on a 100× decimated envelope
 * (±maxSeconds), then a sample-exact search around it.
 */
export function alignOffset(suspect: Float32Array, master: Float32Array, sampleRate: number, maxSeconds = 20): number {
  const F = 100;
  const s = decimateAbs(suspect, F);
  const m = decimateAbs(master, F);
  const maxLag = Math.floor((maxSeconds * sampleRate) / F);
  const mean = (x: Float32Array) => x.reduce((a, v) => a + v, 0) / Math.max(1, x.length);
  const ms = mean(s), mm = mean(m);
  let best = 0, bestScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let acc = 0, n = 0;
    const start = Math.max(0, -lag);
    const end = Math.min(m.length, s.length - lag);
    for (let i = start; i < end; i++) { acc += (s[i + lag] - ms) * (m[i] - mm); n++; }
    if (n > 0 && acc / Math.sqrt(n) > bestScore) { bestScore = acc / Math.sqrt(n); best = lag; }
  }
  const coarse = best * F;
  // Up to 10 s from the middle of the part both files share (a leak may be cut at either end).
  const lo = Math.max(0, -coarse) + 2 * F;
  const hi = Math.min(master.length, suspect.length - coarse) - 2 * F;
  if (hi - lo < sampleRate / 10) return coarse;
  const win = Math.min(Math.floor(sampleRate * 10), hi - lo);
  const mStart = Math.floor((lo + hi) / 2 - win / 2);
  let fine = coarse, fineScore = -Infinity;
  for (let d = -2 * F; d <= 2 * F; d++) {
    const off = coarse + d;
    const sStart = mStart + off;
    if (sStart < 0 || sStart + win > suspect.length) continue;
    const v = dot(suspect, sStart, master, mStart, win);
    if (v > fineScore) { fineScore = v; fine = off; }
  }
  return fine;
}

export type WatermarkScore = { copyId: string; z: number };

/**
 * Non-blind detection. `suspectMono` and `masterMono` at the same sample rate. Returns the candidates sorted by
 * z-score (≈ N(0,1) for a copy that is not in the file; the copy that leaked scores far above 8).
 */
export function detectWatermark(
  suspectMono: Float32Array,
  masterMono: Float32Array,
  candidateCopyIds: readonly string[],
  sampleRate = 44_100,
): { offset: number; gain: number; scores: WatermarkScore[] } {
  const offset = alignOffset(suspectMono, masterMono, sampleRate);
  const start = Math.max(0, -offset);
  const end = Math.min(masterMono.length, suspectMono.length - offset);
  const n = Math.max(0, end - start);
  if (n < sampleRate) return { offset, gain: 0, scores: candidateCopyIds.map((copyId) => ({ copyId, z: 0 })) };
  const mm = dot(masterMono, start, masterMono, start, n) || 1;
  const gain = dot(suspectMono, start + offset, masterMono, start, n) / mm;
  const residual = new Float32Array(n);
  for (let i = 0; i < n; i++) residual[i] = suspectMono[start + offset + i] - gain * masterMono[start + i];
  const rr = dot(residual, 0, residual, 0, n) || 1;
  const scores = candidateCopyIds.map((copyId) => {
    const mark = watermarkSignal(masterMono, copyId);
    let rw = 0, ww = 0;
    for (let i = 0; i < n; i++) {
      const w = gain * mark[start + i];
      rw += residual[i] * w;
      ww += w * w;
    }
    const z = ww > 0 ? (rw / Math.sqrt(ww * rr)) * Math.sqrt(n / CHIP) : 0;
    return { copyId, z };
  });
  scores.sort((a, b) => b.z - a.z);
  return { offset, gain, scores };
}
