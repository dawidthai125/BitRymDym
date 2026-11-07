/**
 * Monophonic audio to Studio MIDI notes. One pitch at a time.
 * Silence under the floor closes the note. Not a polyphonic transcription.
 */

import { MIDI_LIMITS, type MidiNote } from "@/lib/studio/studio-midi";

const FLOOR = Math.pow(10, -45 / 20);

/** Instrument with no notes, else an empty non-beat track that is not a vocal. Never overwrites notes. */
export function pickMidiTrackId(tracks: readonly { id: string; role: string; noteCount: number }[]): string | null {
  const empty = tracks.filter((t) => t.noteCount <= 0);
  const instrument = empty.find((t) => t.role === "instrument");
  if (instrument) return instrument.id;
  const hasInstrument = tracks.some((t) => t.role === "instrument");
  if (hasInstrument) return null;
  const vocal = new Set(["lead_vocal", "adlib", "double", "backing"]);
  return empty.find((t) => t.role !== "beat" && !vocal.has(t.role))?.id ?? null;
}

/** Average blocks so pitch tracking stays cheap. */
export function downsampleMono(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!(fromRate > toRate) || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const n = Math.floor(samples.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += samples[j] || 0;
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

export function audioToMidiNotes(samples: Float32Array, sampleRate: number, startMs = 0): MidiNote[] {
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const frame = Math.max(256, Math.round(sr * 0.04));
  const hop = Math.floor(frame / 2);
  const notes: MidiNote[] = [];
  let open: { pitch: number; t: number; vel: number } | null = null;
  const origin = Math.max(0, Math.round(startMs));

  const close = (endSample: number) => {
    if (!open) return;
    const endMs = origin + Math.round((endSample / sr) * 1000);
    const dur = endMs - open.t;
    if (dur >= 40 && notes.length < MIDI_LIMITS.maxNotes) {
      notes.push({ t: open.t, dur, pitch: open.pitch, vel: open.vel });
    }
    open = null;
  };

  for (let pos = 0; pos + frame < samples.length; pos += hop) {
    let e = 0;
    for (let i = 0; i < frame; i++) e += (samples[pos + i] || 0) ** 2;
    const rms = Math.sqrt(e / frame);
    if (rms < FLOOR) {
      close(pos);
      continue;
    }
    const hz = pitchHz(samples, pos, frame, sr);
    if (!hz) {
      close(pos);
      continue;
    }
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    if (midi < MIDI_LIMITS.pitch.min || midi > MIDI_LIMITS.pitch.max) {
      close(pos);
      continue;
    }
    const vel = Math.min(1, Math.max(0.15, rms * 4));
    const t = origin + Math.round((pos / sr) * 1000);
    if (!open || open.pitch !== midi) {
      close(pos);
      open = { pitch: midi, t, vel };
    }
  }
  close(samples.length);
  return notes;
}

function pitchHz(samples: Float32Array, pos: number, frame: number, sr: number): number | null {
  const minLag = Math.max(2, Math.round(sr / 1000));
  const maxLag = Math.min(frame - 2, Math.round(sr / 70));
  const scores: number[] = [];
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i < frame - lag; i++) {
      const x = samples[pos + i] || 0;
      const y = samples[pos + i + lag] || 0;
      corr += x * y;
      a += x * x;
      b += y * y;
    }
    const score = corr / (Math.sqrt(a * b) || 1);
    scores.push(score);
    if (score > best) best = score;
  }
  if (best < 0.6) return null;
  const floor = best * 0.98;
  for (let i = 0; i < scores.length; i++) {
    const score = scores[i] ?? 0;
    if (score >= 0.6 && score >= floor) return sr / (minLag + i);
  }
  return null;
}
