/**
 * Automatic latency: every take carries a trace of the beat (headphones leak into the microphone).
 * Comparing that trace with the beat itself gives the real round trip of this very take — no test, no click.
 * Pure math. Nothing here touches the recorded sound.
 */

import { Fft } from "@/lib/studio/cleanup/fft";
import { isBeatSpeedUp } from "@/lib/studio/studio-beat-speed";
import { LATENCY_MAX_MS, LATENCY_MIN_MS } from "@/lib/studio/recording/latency";

export const ALIGN_RATE = 12_000;
/** Shorter than this says too little; longer than the second value adds only work. */
export const ALIGN_MIN_SECONDS = 4;
export const ALIGN_MAX_SECONDS = 16;

const N = 16_384;
/** Short microphone frames: the pauses between words, where the beat is bare, count on their own. */
const FRAME = 2_048;
const HOP = FRAME / 2;
const BAND_HZ: readonly [number, number] = [180, 5_200];
/** The peak of pure noise over this search stays below about 5. Measured on real beats and voices: no wrong answer from 9 up. */
const MIN_PEAK_SIGMA = 9;
/** A looped beat also matches itself one bar or one hi-hat later. */
const MAX_SECOND_PEAK = 0.8;
const HALVES_AGREE_MS = 3;

export type BleedLag = { lagMs: number; sigma: number; second: number };

type Peak = { lag: number; sigma: number; second: number };

const LO = Math.round((LATENCY_MIN_MS * ALIGN_RATE) / 1000);
const HI = Math.round((LATENCY_MAX_MS * ALIGN_RATE) / 1000);
/** How much more than its share one quiet moment may say. */
const CAP = 6;

type Frames = { re: Float32Array[]; im: Float32Array[] };

/** Lets the page breathe between chunks of work. */
export type AlignYield = () => Promise<void>;

/**
 * Cross-spectrum of every microphone frame with the beat around it (so each lag has the full overlap), weighted
 * by how much beat there can be against what else the microphone hears: loud words count little, pauses a lot.
 */
async function crossFrames(fft: Fft, mic: Float32Array, beat: Float32Array, length: number, breathe: AlignYield): Promise<Frames> {
  const lo = Math.ceil((BAND_HZ[0] * N) / ALIGN_RATE);
  const hi = Math.floor((BAND_HZ[1] * N) / ALIGN_RATE);
  const span = FRAME + HI - LO;
  const starts: number[] = [];
  for (let at = 0; at + FRAME <= length; at += HOP) starts.push(at);
  const M: { re: Float32Array; im: Float32Array }[] = [];
  const B: { re: Float32Array; im: Float32Array }[] = [];
  const meanM = new Float64Array(hi + 1);
  const meanB = new Float64Array(hi + 1);
  for (const at of starts) {
    const mr = new Float64Array(N);
    const mi = new Float64Array(N);
    const br = new Float64Array(N);
    const bi = new Float64Array(N);
    for (let i = 0; i < FRAME; i += 1) mr[i] = (mic[at + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / FRAME));
    // beat[at - HI .. at - LO + FRAME): a lag L puts the beat of at - L under this frame.
    for (let i = 0; i < span && i < N; i += 1) br[i] = at - HI + i >= 0 ? beat[at - HI + i] ?? 0 : 0;
    fft.transform(mr, mi);
    fft.transform(br, bi);
    for (let k = lo; k <= hi; k += 1) {
      meanM[k]! += Math.hypot(mr[k]!, mi[k]!);
      meanB[k]! += Math.hypot(br[k]!, bi[k]!);
    }
    M.push({ re: Float32Array.from(mr.subarray(0, hi + 1)), im: Float32Array.from(mi.subarray(0, hi + 1)) });
    B.push({ re: Float32Array.from(br.subarray(0, hi + 1)), im: Float32Array.from(bi.subarray(0, hi + 1)) });
    if (M.length % 8 === 0) await breathe();
  }
  const out: Frames = { re: [], im: [] };
  let loudest = 0;
  for (let k = lo; k <= hi; k += 1) if (meanB[k]! > loudest) loudest = meanB[k]!;
  for (let f = 0; f < starts.length; f += 1) {
    const re = new Float32Array(hi + 1);
    const im = new Float32Array(hi + 1);
    for (let k = lo; k <= hi; k += 1) {
      if (meanB[k]! < loudest * 0.0015) continue;
      const mr = M[f]!.re[k]!;
      const mi = M[f]!.im[k]!;
      const br = B[f]!.re[k]!;
      const bi = B[f]!.im[k]!;
      const m = Math.hypot(mr, mi);
      const b = Math.hypot(br, bi);
      if (m < 1e-12 || b < 1e-12) continue;
      const weight = Math.min(CAP, (b / meanB[k]!) / (m / meanM[k]!)) / (m * b);
      re[k] = (mr * br + mi * bi) * weight;
      im[k] = (mi * br - mr * bi) * weight;
    }
    M[f] = B[f] = { re: re.subarray(0, 0), im: im.subarray(0, 0) };
    out.re.push(re);
    out.im.push(im);
  }
  return out;
}

/** Correlation over the searched lags, index 0 = LO. */
function correlation(fft: Fft, frames: Frames, pick: (frame: number) => boolean): Float64Array | null {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let used = 0;
  for (let f = 0; f < frames.re.length; f += 1) {
    if (!pick(f)) continue;
    used += 1;
    const fr = frames.re[f]!;
    const fi = frames.im[f]!;
    for (let k = 1; k < fr.length; k += 1) {
      re[k]! += fr[k]!;
      im[k]! += fi[k]!;
    }
  }
  if (used === 0) return null;
  for (let k = 1; k < N / 2; k += 1) {
    re[N - k] = re[k]!;
    im[N - k] = -im[k]!;
  }
  fft.transform(re, im, true);
  // conj(beat) * mic peaks at (frame start) - (beat position) = lag - HI, modulo N.
  return Float64Array.from({ length: HI - LO + 1 }, (_, i) => Math.abs(re[(((LO + i - HI) % N) + N) % N]!));
}

function peakOf(corr: Float64Array): Peak | null {
  let best = 0;
  for (let i = 1; i < corr.length; i += 1) if (corr[i]! > corr[best]!) best = i;
  if (best === 0 || best === corr.length - 1) return null;
  const guard = Math.round(0.004 * ALIGN_RATE);
  let sum = 0;
  let count = 0;
  let second = 0;
  for (let i = 0; i < corr.length; i += 1) {
    if (Math.abs(i - best) <= guard) continue;
    const v = corr[i]!;
    sum += v * v;
    count += 1;
    if (v > second) second = v;
  }
  const sigma = Math.sqrt(sum / Math.max(1, count));
  const top = corr[best]!;
  if (!(sigma > 0)) return null;
  const a = corr[best - 1]!;
  const c = corr[best + 1]!;
  const curve = a - 2 * top + c;
  const shift = curve < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve)) : 0;
  return { lag: LO + best + shift, sigma: top / sigma, second: second / top };
}

/**
 * How late the beat is in the microphone. `mic[i]` and `beat[i]` are the same moment on the timeline as
 * predicted without any correction, both mono at ALIGN_RATE. Null: no trustworthy trace of the beat.
 */
export async function bleedLag(
  mic: Float32Array,
  beat: Float32Array,
  breathe: AlignYield = async () => undefined,
): Promise<BleedLag | null> {
  const length = Math.min(mic.length, beat.length, ALIGN_MAX_SECONDS * ALIGN_RATE);
  if (length < ALIGN_MIN_SECONDS * ALIGN_RATE) return null;
  let beatPower = 0;
  for (let i = 0; i < length; i += 1) beatPower += beat[i]! * beat[i]!;
  if (beatPower / length < 1e-7) return null;
  const fft = new Fft(N);
  const frames = await crossFrames(fft, mic, beat, length, breathe);
  const half = Math.floor(frames.re.length / 2);
  const whole = correlation(fft, frames, () => true);
  const peak = whole && peakOf(whole);
  if (!peak || peak.sigma < MIN_PEAK_SIGMA || peak.second > MAX_SECOND_PEAK) return null;
  // The same answer from both halves of the take: chance and repeating loops do not give that.
  for (const pick of [(f: number) => f < half, (f: number) => f >= half]) {
    const part = correlation(fft, frames, pick);
    const p = part && peakOf(part);
    if (!p || (Math.abs(p.lag - peak.lag) * 1000) / ALIGN_RATE > HALVES_AGREE_MS) return null;
  }
  return { lagMs: Math.round((peak.lag * 10_000) / ALIGN_RATE) / 10, sigma: peak.sigma, second: peak.second };
}

/** Mono at ALIGN_RATE. A symmetric average, so nothing moves in time. */
export function toAlignRate(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === ALIGN_RATE) return samples;
  const step = sampleRate / ALIGN_RATE;
  const out = new Float32Array(Math.max(0, Math.floor(samples.length / step)));
  const reach = Math.max(1, step / 2);
  for (let i = 0; i < out.length; i += 1) {
    const mid = i * step;
    const a = Math.max(0, Math.ceil(mid - reach));
    const b = Math.min(samples.length - 1, Math.floor(mid + reach));
    let sum = 0;
    for (let j = a; j <= b; j += 1) sum += samples[j]!;
    out[i] = b >= a ? sum / (b - a + 1) : 0;
  }
  return out;
}

export type AlignBeatClip = {
  trackId: string;
  sourceKind: string;
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  muted: boolean;
  stretchRatio?: number;
  pitchCents?: number;
  scratchRate?: number;
  scratchReverse?: boolean;
};

/** The beat clip heard at `startMs`, when it plays as recorded or only faster like a tape. */
export function beatClipAt<C extends AlignBeatClip>(
  clips: readonly C[],
  tracks: readonly { id: string; muted: boolean; solo: boolean }[],
  startMs: number,
): C | null {
  const anySolo = tracks.some((t) => t.solo);
  return (
    clips.find((c) => {
      if (c.sourceKind !== "BEAT_REF" || c.muted) return false;
      const track = tracks.find((t) => t.id === c.trackId);
      if (!track || track.muted || (anySolo && !track.solo)) return false;
      if (!isBeatSpeedUp({ stretch: c.stretchRatio ?? 1, pitchCents: c.pitchCents ?? 0 })) return false;
      if ((c.scratchRate ?? 1) !== 1 || c.scratchReverse) return false;
      return startMs >= c.timelineStartMs && startMs < c.timelineStartMs + c.durationMs - ALIGN_MIN_SECONDS * 1000;
    }) ?? null
  );
}

/** MP4/AAC recordings (older iPhone and iPad) carry an encoder delay that decoding and playback treat differently. */
export function recordsWithoutAutoAlign(mimeType: string | null | undefined): boolean {
  return /mp4|aac|m4a/i.test(mimeType ?? "");
}

// ── Microphone mode ─────────────────────────────────────────────────────────

const HEADPHONES_RE =
  /headphone|headset|earphone|earbud|earpod|airpods|\bbuds\d?\b|s[łl]uchawk|\bw[fh]-\d|freebuds|quietcomfort|arctis|hyperx cloud|evolve|\belite \d/i;
const HEADSET_MIC_RE = /headset|airpods|\bbuds\d?\b|zestaw słuchawkowy/i;
const INTERFACE_RE =
  /focusrite|scarlett|u-?phoria|\bumc\d|steinberg|\bur22|audient|presonus|audiobox|m-audio|\bmotu\b|minifuse|universal audio|\bapollo\b|solid state logic|\bssl ?2|tascam|rubix|komplete audio/i;
/** A name that says the sound may come out into the room. It wins over everything above. */
const SPEAKERS_RE =
  /speaker|g[łl]o[śs]nik|earpiece|\bspeak \d|\bflip\b|\bcharge\b|\bgo ?\d|\bxtreme\b|soundlink|soundbar|boombox|g560|monitor|display|hdmi|\btv\b|virtual|sonar/i;

/** Headphones or a studio interface: the beat is not in the room, so the browser must not filter the voice. */
export function headphonesLikely(devices: { inputLabel?: string | null; outputLabel?: string | null }): boolean {
  const input = devices.inputLabel ?? "";
  const output = devices.outputLabel ?? "";
  if (SPEAKERS_RE.test(output) || SPEAKERS_RE.test(input)) return false;
  return HEADPHONES_RE.test(output) || INTERFACE_RE.test(output) || HEADSET_MIC_RE.test(input);
}

export const HEADPHONES_STORAGE_KEY = "brd.studio.headphones.v1";

/** The user's own answer for this device pair; null = decide from the device names. */
export function readHeadphones(storage: Pick<Storage, "getItem"> | null, deviceKey: string): boolean | null {
  try {
    const all = JSON.parse(storage?.getItem(HEADPHONES_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const v = all?.[deviceKey];
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

export function writeHeadphones(storage: Pick<Storage, "getItem" | "setItem"> | null, deviceKey: string, value: boolean): void {
  try {
    const all = JSON.parse(storage?.getItem(HEADPHONES_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const entries = Object.entries({ ...all, [deviceKey]: value }).slice(-12);
    storage?.setItem(HEADPHONES_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // private mode: the choice lasts for this visit
  }
}
