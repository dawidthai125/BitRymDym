/**
 * BRD Tune note editor (Gold) — offline note detection for the piano roll.
 * YIN pitch track on a ~11 kHz decimated mono signal (same detector family as
 * TuneCore), then segmentation into steady notes. Framework-free, pure.
 */

export type DetectedPitchFrame = { ms: number; midi: number | null };

export type DetectedNote = {
  startMs: number;
  endMs: number;
  /** Median sung pitch (fractional MIDI). */
  midi: number;
  /** Pitch curve inside the note (fractional MIDI per frame) for drawing. */
  curve: number[];
};

export const NOTE_DETECT_HOP_MS = 15;
const MIN_NOTE_MS = 90;
const MAX_GAP_MS = 45;
const SPLIT_SEMITONES = 0.75;

/** Mono mixdown of channel data. */
export function monoMix(channels: readonly Float32Array[]): Float32Array {
  const len = Math.min(...channels.map((c) => c.length));
  if (channels.length === 1) return channels[0]!.subarray(0, len);
  const out = new Float32Array(len);
  for (const c of channels) for (let i = 0; i < len; i += 1) out[i]! += c[i]! / channels.length;
  return out;
}

/** YIN pitch track (fractional MIDI or null = unvoiced) every NOTE_DETECT_HOP_MS. */
export function detectPitchTrack(mono: Float32Array, sampleRate: number): DetectedPitchFrame[] {
  const decim = Math.max(1, Math.round(sampleRate / 11025));
  const dsr = sampleRate / decim;
  const n = Math.floor(mono.length / decim);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let acc = 0;
    for (let k = 0; k < decim; k += 1) acc += mono[i * decim + k]!;
    d[i] = acc / decim;
  }
  const tauMin = Math.max(2, Math.floor(dsr / 1000));
  const tauMax = Math.ceil(dsr / 75);
  const W = tauMax;
  const hop = Math.max(1, Math.round((dsr * NOTE_DETECT_HOP_MS) / 1000));
  const yd = new Float32Array(tauMax + 2);
  const frames: DetectedPitchFrame[] = [];
  for (let start = 0; start + W + tauMax < n; start += hop) {
    const ms = ((start + W / 2) / dsr) * 1000;
    let energy = 0;
    for (let j = 0; j < W; j += 1) energy += d[start + j]! * d[start + j]!;
    if (energy / W <= 3.2e-6) {
      frames.push({ ms, midi: null });
      continue;
    }
    yd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      let sum = 0;
      for (let j = 0; j < W; j += 1) {
        const diff = d[start + j]! - d[start + j + tau]!;
        sum += diff * diff;
      }
      running += sum;
      yd[tau] = running > 0 ? (sum * tau) / running : 1;
    }
    let found = -1;
    for (let tau = tauMin; tau < tauMax; tau += 1) {
      if (yd[tau]! < 0.15) {
        while (tau + 1 < tauMax && yd[tau + 1]! < yd[tau]!) tau += 1;
        found = tau;
        break;
      }
    }
    if (found <= 0) {
      frames.push({ ms, midi: null });
      continue;
    }
    // Parabolic interpolation around the dip.
    const a = yd[found - 1] ?? yd[found]!;
    const b = yd[found]!;
    const c = yd[found + 1] ?? b;
    const den = a - 2 * b + c;
    const tau = found + (den > 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0);
    const hz = dsr / tau;
    frames.push({ ms, midi: 69 + 12 * Math.log2(hz / 440) });
  }
  return frames;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Pitch track → steady notes (split on gaps and on pitch jumps). */
export function segmentNotes(frames: readonly DetectedPitchFrame[]): DetectedNote[] {
  const notes: DetectedNote[] = [];
  let cur: { start: number; last: number; curve: number[] } | null = null;
  const flush = () => {
    if (cur && cur.last - cur.start + NOTE_DETECT_HOP_MS >= MIN_NOTE_MS && cur.curve.length >= 3) {
      notes.push({
        startMs: Math.round(cur.start - NOTE_DETECT_HOP_MS / 2),
        endMs: Math.round(cur.last + NOTE_DETECT_HOP_MS / 2),
        midi: Math.round(median(cur.curve) * 100) / 100,
        curve: cur.curve.map((v) => Math.round(v * 100) / 100),
      });
    }
    cur = null;
  };
  for (const f of frames) {
    if (f.midi == null) {
      if (cur && f.ms - cur.last > MAX_GAP_MS) flush();
      continue;
    }
    if (cur) {
      const ref = median(cur.curve.slice(-6));
      if (Math.abs(f.midi - ref) > SPLIT_SEMITONES) flush();
    }
    if (!cur) cur = { start: f.ms, last: f.ms, curve: [] };
    cur.curve.push(f.midi);
    cur.last = f.ms;
  }
  flush();
  return notes;
}

/** Nearest note of the key (0 major / 1 minor / 2 chromatic). */
export function snapMidiToScale(midi: number, keyRoot: number, scale: number): number {
  const steps = scale === 0 ? [0, 2, 4, 5, 7, 9, 11] : scale === 1 ? [0, 2, 3, 5, 7, 8, 10] : null;
  const base = Math.round(midi);
  if (!steps) return base;
  let best = base;
  let bestDist = Infinity;
  for (let k = -2; k <= 2; k += 1) {
    const note = base + k;
    const pc = (((note - keyRoot) % 12) + 12) % 12;
    if (!steps.includes(pc)) continue;
    const dist = Math.abs(note - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = note;
    }
  }
  return best;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** "A3", "C#4 +12c" (cents shown when off the semitone). */
export function midiLabel(midi: number): string {
  const r = Math.round(midi);
  const cents = Math.round((midi - r) * 100);
  const name = `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
  return cents === 0 ? name : `${name} ${cents > 0 ? "+" : ""}${cents}c`;
}
