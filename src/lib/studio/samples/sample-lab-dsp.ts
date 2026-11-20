/**
 * Sample Lab — pure audio helpers (no DOM, no I/O, unit-tested).
 * Channels are Float32Array per channel at one sample rate.
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Peak level of all channels in dBFS (-Infinity for silence). */
export function peakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** RMS level of one block in dBFS. */
export function rmsDb(block: Float32Array): number {
  if (block.length === 0) return -Infinity;
  let sum = 0;
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
  const rms = Math.sqrt(sum / block.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Fundamental frequency of one frame (Hz) by normalised autocorrelation, or null when
 * the frame is too quiet or not periodic enough. Range 40–1500 Hz covers bass to lead.
 */
export function detectPitchHz(frame: Float32Array, sampleRate: number, minHz = 40, maxHz = 1500): number | null {
  const n = frame.length;
  if (n < 64 || rmsDb(frame) < -50) return null;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag) return null;
  let energy0 = 0;
  for (let i = 0; i < n; i++) energy0 += frame[i] * frame[i];
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1 && lag < n; lag++) {
    let s = 0;
    let e = 0;
    for (let i = 0; i + lag < n; i++) {
      s += frame[i] * frame[i + lag];
      e += frame[i + lag] * frame[i + lag];
    }
    corr[lag] = s / Math.sqrt(energy0 * e || 1);
  }
  // First lag after the correlation dips that reaches close to the global maximum (avoids octave errors).
  let best = -1;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > best) { best = corr[lag]; bestLag = lag; }
  if (best < 0.6) return null;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= 0.9 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; break; }
  }
  // Parabolic interpolation around the peak for sub-sample accuracy.
  const a = corr[bestLag - 1] ?? corr[bestLag];
  const b = corr[bestLag];
  const c = corr[bestLag + 1] ?? corr[bestLag];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const lag = bestLag + (Number.isFinite(shift) && Math.abs(shift) < 1 ? shift : 0);
  return sampleRate / lag;
}

export type NoteReading = { midi: number; name: string; octave: number; cents: number; label: string };

/** Nearest equal-tempered note (A4 = 440 Hz) and the offset in cents. */
export function hzToNote(hz: number): NoteReading {
  const exact = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(exact);
  const cents = Math.round((exact - midi) * 100);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { midi, name, octave, cents, label: `${name}${octave}` };
}

/** Pitch track of a whole take: one MIDI note per voiced frame (hop 1024). */
export function pitchTrack(mono: Float32Array, sampleRate: number, frameSize = 2048, hop = 1024): number[] {
  const out: number[] = [];
  for (let start = 0; start + frameSize <= mono.length; start += hop) {
    const hz = detectPitchHz(mono.subarray(start, start + frameSize), sampleRate);
    if (hz) out.push(hzToNote(hz).midi);
  }
  return out;
}

/** Most frequent note of a one-shot (median of its voiced frames), e.g. "A2". */
export function dominantNote(midis: number[]): string | null {
  if (midis.length === 0) return null;
  const sorted = [...midis].sort((x, y) => x - y);
  const midi = sorted[Math.floor(sorted.length / 2)];
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${Math.floor(midi / 12) - 1}`;
}

// Krumhansl–Kessler key profiles.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Approximate key of a loop/phrase from its pitch track, e.g. "Am" or "F". Null with too few notes. */
export function estimateKey(midis: number[]): string | null {
  if (midis.length < 8) return null;
  const hist = new Array(12).fill(0);
  for (const m of midis) hist[((m % 12) + 12) % 12] += 1;
  if (hist.filter((v) => v > 0).length < 3) return null;
  let best = { score: -2, key: "" };
  for (let tonic = 0; tonic < 12; tonic++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - tonic + 12) % 12]);
    const maj = correlate(hist, rot(MAJOR));
    const min = correlate(hist, rot(MINOR));
    if (maj > best.score) best = { score: maj, key: NOTE_NAMES[tonic] };
    if (min > best.score) best = { score: min, key: `${NOTE_NAMES[tonic]}m` };
  }
  return best.key;
}

/** Frame range [start, end) without leading/trailing silence, with a little air kept. */
export function trimSilence(
  channels: Float32Array[],
  sampleRate: number,
  thresholdDb = -48,
  padMs = 15,
): { start: number; end: number } {
  const length = channels[0]?.length ?? 0;
  const threshold = 10 ** (thresholdDb / 20);
  const loud = (i: number) => channels.some((ch) => Math.abs(ch[i]) >= threshold);
  let start = 0;
  while (start < length && !loud(start)) start++;
  let end = length;
  while (end > start && !loud(end - 1)) end--;
  if (start >= end) return { start: 0, end: 0 };
  const pad = Math.round((padMs / 1000) * sampleRate);
  return { start: Math.max(0, start - pad), end: Math.min(length, end + pad) };
}

/** Copy of a frame range of every channel. */
export function sliceChannels(channels: Float32Array[], start: number, end: number): Float32Array[] {
  return channels.map((ch) => ch.slice(Math.max(0, start), Math.min(ch.length, end)));
}

/** Linear fade in/out in place (keeps clicks out of one-shots and loop seams). */
export function applyFades(channels: Float32Array[], sampleRate: number, inMs: number, outMs: number): void {
  for (const ch of channels) {
    const fin = Math.min(ch.length, Math.round((inMs / 1000) * sampleRate));
    const fout = Math.min(ch.length, Math.round((outMs / 1000) * sampleRate));
    for (let i = 0; i < fin; i++) ch[i] *= i / fin;
    for (let i = 0; i < fout; i++) ch[ch.length - 1 - i] *= i / fout;
  }
}

/** Scale so the peak sits at `targetDb` dBFS (default -1). Returns the applied gain in dB. */
export function normalizePeak(channels: Float32Array[], targetDb = -1): number {
  const peak = peakDb(channels);
  if (!Number.isFinite(peak)) return 0;
  const gainDb = targetDb - peak;
  const gain = 10 ** (gainDb / 20);
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  return gainDb;
}

/** Exact frame count of `bars` bars at `bpm` (4/4). */
export function loopLengthFrames(bpm: number, bars: number, sampleRate: number, beatsPerBar = 4): number {
  return Math.round(((bars * beatsPerBar * 60) / bpm) * sampleRate);
}

/** Largest whole number of bars (1, 2, 4, 8, 16) that fits in `maxSeconds` at `bpm`. */
export function maxBarsFor(bpm: number, maxSeconds = 30): number {
  const barSeconds = (4 * 60) / bpm;
  return [16, 8, 4, 2, 1].find((b) => b * barSeconds <= maxSeconds) ?? 1;
}

/** 16-bit PCM WAV (interleaved) — the sample format the server accepts. */
export function encodeWav16(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * 2, true);
  v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

export type LabSampleType = "oneshot" | "loop" | "phrase";

/**
 * The whole automatic clean-up of one take. Loops are cut to whole bars from `loopStart`;
 * one-shots and phrases lose their silence. Everything gets fades and a -1 dBFS peak.
 */
export function processTake(params: {
  channels: Float32Array[];
  sampleRate: number;
  type: LabSampleType;
  bpm: number | null;
  bars: number | null;
  /** Frame where bar 1 starts (after the count-in), loops only. */
  loopStart?: number;
}): { channels: Float32Array[]; note: string | null; key: string | null; gainDb: number } {
  const { sampleRate, type } = params;
  let out: Float32Array[];
  if (type === "loop" && params.bpm && params.bars) {
    const start = params.loopStart ?? 0;
    out = sliceChannels(params.channels, start, start + loopLengthFrames(params.bpm, params.bars, sampleRate));
    applyFades(out, sampleRate, 3, 3);
  } else {
    const range = trimSilence(params.channels, sampleRate);
    out = sliceChannels(params.channels, range.start, range.end);
    applyFades(out, sampleRate, 4, type === "oneshot" ? 30 : 60);
  }
  const gainDb = normalizePeak(out, -1);
  const mono = out.length > 1 ? out[0].map((v, i) => (v + out[1][i]) / 2) : out[0] ?? new Float32Array(0);
  const track = pitchTrack(mono, sampleRate);
  return {
    channels: out,
    note: type === "oneshot" ? dominantNote(track.slice(0, 40)) : null,
    key: type === "oneshot" ? null : estimateKey(track),
    gainDb,
  };
}
