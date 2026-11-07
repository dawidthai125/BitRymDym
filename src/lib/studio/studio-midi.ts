import { renderInstrumentVoice } from "@/lib/studio/samples/sample-synth";

/**
 * Studio instrument notes. Pure render shared by the browser preview and a later server mix:
 * one definition of the sample at time t. No I/O, no AudioContext.
 *
 * Notes sit on a project timeline in milliseconds. pitch is a MIDI note (69 = A4 = 440 Hz).
 * vel is 0..1. Before the note and after it ends the sample is 0.
 */

export const MIDI_INSTRUMENTS = [
  "sine",
  "square",
  "saw",
  "piano",
  "bass",
  "guitar",
  "lead",
  "pad",
  "pluck",
  "brass",
  "drums",
  "scratch",
] as const;
export type MidiInstrument = (typeof MIDI_INSTRUMENTS)[number];

const MIDI_INSTRUMENT_SET: ReadonlySet<string> = new Set(MIDI_INSTRUMENTS);

type TonalInstrument = "piano" | "bass" | "guitar" | "lead" | "pad" | "pluck" | "brass";

function isTonalInstrument(instrument: MidiInstrument): instrument is TonalInstrument {
  return (
    instrument === "piano" ||
    instrument === "bass" ||
    instrument === "guitar" ||
    instrument === "lead" ||
    instrument === "pad" ||
    instrument === "pluck" ||
    instrument === "brass"
  );
}

export type PlayKeyInstrument = "piano" | "guitar" | "bass" | "drums";

export type MidiNote = { t: number; dur: number; pitch: number; vel: number };

export const MIDI_LIMITS = {
  maxNotes: 512,
  maxTimeMs: 3_600_000,
  pitch: { min: 0, max: 127 },
} as const;

export function midiHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

export function isMidiInstrument(v: unknown): v is MidiInstrument {
  return typeof v === "string" && MIDI_INSTRUMENT_SET.has(v);
}

/** Drop bad notes. Same millisecond and pitch: the later note replaces the earlier one. */
export function cleanMidiNotes(raw: unknown): MidiNote[] {
  if (!Array.isArray(raw)) return [];
  const out: MidiNote[] = [];
  for (const item of raw) {
    const n = item as { t?: unknown; dur?: unknown; pitch?: unknown; vel?: unknown } | null;
    const t = n?.t;
    const dur = n?.dur;
    const pitch = n?.pitch;
    const vel = n?.vel;
    const ok =
      typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= MIDI_LIMITS.maxTimeMs &&
      typeof dur === "number" && Number.isFinite(dur) && dur > 0 && t + dur <= MIDI_LIMITS.maxTimeMs &&
      typeof pitch === "number" && Number.isInteger(pitch) && pitch >= MIDI_LIMITS.pitch.min && pitch <= MIDI_LIMITS.pitch.max &&
      typeof vel === "number" && Number.isFinite(vel) && vel >= 0 && vel <= 1;
    if (!ok) continue;
    if (out.length >= MIDI_LIMITS.maxNotes) break;
    out.push({ t: Math.round(t), dur: Math.round(dur), pitch, vel });
  }
  return out;
}

export const MIDI_VERSION = 1 as const;

/** Stored on studio_tracks.midi. Empty notes mean the column is NULL. */
export type StudioMidiV1 = {
  v: typeof MIDI_VERSION;
  instrument: MidiInstrument;
  notes: MidiNote[];
};

export class MidiValidationError extends Error {
  constructor(
    message: string,
    readonly code: "bad_shape" | "bad_instrument" | "too_many_notes",
  ) {
    super(message);
    this.name = "MidiValidationError";
  }
}

export function emptyMidi(): StudioMidiV1 {
  return { v: MIDI_VERSION, instrument: "sine", notes: [] };
}

export function hasMidi(m: StudioMidiV1 | null | undefined): boolean {
  return !!m && m.notes.length > 0;
}

function midiRecord(raw: unknown): { v: unknown; instrument: unknown; notes: unknown } | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { v?: unknown; instrument?: unknown; notes?: unknown };
  return { v: o.v, instrument: o.instrument, notes: o.notes };
}

/** Strict parse for writes. Drops bad notes. Rejects an unknown instrument and too many notes. */
export function parseMidiForWrite(raw: unknown): StudioMidiV1 {
  if (raw == null) return emptyMidi();
  const o = midiRecord(raw);
  if (!o || o.v !== MIDI_VERSION || !Array.isArray(o.notes)) {
    throw new MidiValidationError("Nieprawidłowy format nut.", "bad_shape");
  }
  if (!isMidiInstrument(o.instrument)) {
    throw new MidiValidationError("Nieznany instrument.", "bad_instrument");
  }
  if (o.notes.length > MIDI_LIMITS.maxNotes) {
    throw new MidiValidationError(`Maks. ${MIDI_LIMITS.maxNotes} nut.`, "too_many_notes");
  }
  return { v: MIDI_VERSION, instrument: o.instrument, notes: cleanMidiNotes(o.notes) };
}

/** Tolerant read (DB row → value). Never throws. */
export function readMidi(raw: unknown): StudioMidiV1 {
  try {
    const o = midiRecord(raw);
    if (!o || o.v !== MIDI_VERSION || !isMidiInstrument(o.instrument) || !Array.isArray(o.notes)) return emptyMidi();
    if (o.notes.length > MIDI_LIMITS.maxNotes) return emptyMidi();
    return { v: MIDI_VERSION, instrument: o.instrument, notes: cleanMidiNotes(o.notes) };
  } catch {
    return emptyMidi();
  }
}

function quarterMs(bpm: number): number {
  const safe = Number.isFinite(bpm) ? Math.min(240, Math.max(40, bpm)) : 120;
  return Math.round(60_000 / safe);
}

function atPlayhead(playheadMs: number): number {
  return Math.max(0, Math.round(Number.isFinite(playheadMs) ? playheadMs : 0));
}

function keepOnTimeline(notes: MidiNote[]): MidiNote[] {
  return notes.filter((note) => note.t >= 0 && note.t + note.dur <= MIDI_LIMITS.maxTimeMs);
}

/** C E G C on piano, 400 ms, 40 ms gaps, velocity 0.8, from the playhead. */
export function midiPhraseAt(playheadMs: number): StudioMidiV1 {
  const start = atPlayhead(playheadMs);
  const dur = 400;
  const gap = 40;
  const pitches = [60, 64, 67, 72] as const;
  return {
    v: MIDI_VERSION,
    instrument: "piano",
    notes: keepOnTimeline(pitches.map((pitch, i) => ({ t: start + i * (dur + gap), dur, pitch, vel: 0.8 }))),
  };
}

/** C2 / G2 on the beat, one bar, from the playhead. */
export function bassLineAt(playheadMs: number, bpm: number): StudioMidiV1 {
  const start = atPlayhead(playheadMs);
  const beat = quarterMs(bpm);
  const dur = Math.max(1, Math.round(beat * 0.85));
  const notes = [0, 1, 2, 3].map((i) => ({
    t: start + i * beat,
    dur,
    pitch: i % 2 === 0 ? 36 : 43,
    vel: 0.85,
  }));
  return { v: MIDI_VERSION, instrument: "bass", notes: keepOnTimeline(notes) };
}

/**
 * One click while key-record is on. The first note snaps to the beat at the playhead.
 * Without `sinceMs`, the next click is one grid step later.
 * With `sinceMs` (milliseconds since the previous click), the note lands on the
 * grid the way the player timed it: a very short gap stays on the same beat (a chord),
 * a longer gap leaves the rest. Drums use an eighth-note grid when `gridBeats` is 0.5.
 * A different instrument does not wipe notes that are already on the track.
 */
export function appendPlayedNote(input: {
  midi: StudioMidiV1 | null | undefined;
  instrument: PlayKeyInstrument;
  pitch: number;
  playheadMs: number;
  bpm: number;
  sinceMs?: number;
  gridBeats?: number;
}): { ok: true; midi: StudioMidiV1 } | { ok: false; reason: "other" | "full" | "range" } {
  const current = input.midi && input.midi.notes.length > 0 ? input.midi : null;
  if (current && current.instrument !== input.instrument) return { ok: false, reason: "other" };
  if (!Number.isInteger(input.pitch) || input.pitch < MIDI_LIMITS.pitch.min || input.pitch > MIDI_LIMITS.pitch.max) {
    return { ok: false, reason: "range" };
  }
  const notes = current?.notes ?? [];
  if (notes.length >= MIDI_LIMITS.maxNotes) return { ok: false, reason: "full" };
  const beat = quarterMs(input.bpm);
  const grid = Math.max(1, Math.round(beat * (input.gridBeats === 0.5 ? 0.5 : 1)));
  const dur = Math.max(1, Math.round(beat * (input.instrument === "drums" ? 0.45 : 0.9)));
  const last = notes[notes.length - 1];
  let t = last ? last.t + grid : Math.floor(atPlayhead(input.playheadMs) / beat) * beat;
  if (last && typeof input.sinceMs === "number" && Number.isFinite(input.sinceMs) && input.sinceMs >= 0) {
    t = last.t + Math.round(input.sinceMs / grid) * grid;
  }
  if (notes.some((note) => note.t === t && note.pitch === input.pitch)) t += grid;
  const next = keepOnTimeline([
    ...notes,
    { t, dur, pitch: input.pitch, vel: input.instrument === "drums" ? 0.9 : 0.8 },
  ]);
  if (next.length === notes.length) return { ok: false, reason: "range" };
  return { ok: true, midi: { v: MIDI_VERSION, instrument: input.instrument, notes: next } };
}

export type PlayedNoteReviewCode = "short" | "same" | "leap" | "drums-one" | "drums-ok" | "line-ok";

/** What BITEK can say about notes played on the keys. Empty and other instruments stay quiet. */
export function reviewPlayedNotes(
  midi: StudioMidiV1 | null | undefined,
): { code: PlayedNoteReviewCode; count: number } | null {
  if (!midi || midi.notes.length === 0) return null;
  if (midi.instrument !== "piano" && midi.instrument !== "guitar" && midi.instrument !== "bass" && midi.instrument !== "drums") {
    return null;
  }
  const count = midi.notes.length;
  if (midi.instrument === "drums") {
    const pieces = new Set(midi.notes.map((note) => (note.pitch <= 37 ? "kick" : note.pitch <= 40 ? "snare" : "hat")));
    if (pieces.size < 2) return { code: "drums-one", count };
    return { code: count >= 4 ? "drums-ok" : "short", count };
  }
  if (count < 4) return { code: "short", count };
  const pitches = midi.notes.map((note) => note.pitch);
  if (pitches.every((pitch) => pitch === pitches[0])) return { code: "same", count };
  for (let i = 1; i < pitches.length; i++) {
    if (Math.abs(pitches[i]! - pitches[i - 1]!) > 7) return { code: "leap", count };
  }
  return { code: "line-ok", count };
}

/** One bar: kick on 1 and 3, snare on 2 and 4, hat on every eighth. */
export function drumPatternAt(playheadMs: number, bpm: number): StudioMidiV1 {
  const start = atPlayhead(playheadMs);
  const beat = quarterMs(bpm);
  const step = Math.max(1, Math.round(beat / 2));
  const notes: MidiNote[] = [];
  for (let i = 0; i < 8; i++) {
    const t = start + i * step;
    notes.push({ t, dur: Math.max(1, Math.round(step * 0.9)), pitch: 42, vel: 0.45 });
    if (i % 4 === 0) notes.push({ t, dur: Math.max(1, Math.round(beat * 0.5)), pitch: 36, vel: 0.9 });
    if (i % 4 === 2) notes.push({ t, dur: Math.max(1, Math.round(beat * 0.4)), pitch: 38, vel: 0.75 });
  }
  return { v: MIDI_VERSION, instrument: "drums", notes: keepOnTimeline(notes) };
}

/**
 * One bar of turntable-style scratches on this track, in the project tempo.
 * Pitch 60 is a baby scratch, 67 is a shorter chirp. An existing scratch line
 * keeps its notes and gains this bar. Another instrument is left untouched.
 */
export function scratchPatternAt(
  playheadMs: number,
  bpm: number,
  existing?: StudioMidiV1 | null,
): StudioMidiV1 {
  const start = atPlayhead(playheadMs);
  const beat = quarterMs(bpm);
  const baby = Math.max(1, Math.round(beat * 0.62));
  const chirp = Math.max(1, Math.round(beat * 0.28));
  const bar: MidiNote[] = [
    { t: start + beat, dur: baby, pitch: 60, vel: 0.92 },
    { t: start + beat * 2 + Math.round(beat * 0.5), dur: chirp, pitch: 67, vel: 0.8 },
    { t: start + beat * 3, dur: baby, pitch: 60, vel: 0.92 },
  ];
  const prev = existing && existing.instrument === "scratch" ? existing.notes : [];
  return { v: MIDI_VERSION, instrument: "scratch", notes: keepOnTimeline([...prev, ...bar]).slice(0, MIDI_LIMITS.maxNotes) };
}

/** A short record-like tone read forward and back, so a note sounds like a scratch. */
function renderScratchNote(length: number, sampleRate: number, pitch: number): Float32Array {
  const out = new Float32Array(length);
  if (length <= 0 || sampleRate <= 0) return out;
  const recordLen = Math.max(8, Math.floor(sampleRate * 0.16));
  const record = new Float32Array(recordLen);
  let x = (Math.round(pitch) * 1103515245 + 12345) >>> 0 || 1;
  const nextNoise = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
  for (let i = 0; i < recordLen; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * i) / recordLen);
    record[i] =
      (Math.sin(2 * Math.PI * 190 * t) * 0.3 +
        Math.sin(2 * Math.PI * 680 * t) * 0.34 +
        Math.sin(2 * Math.PI * 1320 * t) * 0.16 +
        nextNoise() * 0.12) *
      env;
  }
  const passes = pitch >= 64 ? 4 : 2;
  for (let i = 0; i < length; i++) {
    const u = i / length;
    const cycle = (u * passes) % 1;
    const forward = Math.floor(u * passes) % 2 === 0;
    const dir = forward ? cycle : 1 - cycle;
    const pos = Math.min(recordLen - 1, Math.floor(dir * (recordLen - 1)));
    const gate = pitch >= 64 ? (Math.sin(u * passes * Math.PI * 2) > 0 ? 1 : 0.12) : 1;
    out[i] = (record[pos] ?? 0) * gate * 0.9;
  }
  return out;
}

function wave(instrument: MidiInstrument, phase: number): number {
  const p = phase - Math.floor(phase);
  if (instrument === "square") return p < 0.5 ? 1 : -1;
  if (instrument === "saw") return 2 * p - 1;
  return Math.sin(2 * Math.PI * p);
}

/**
 * Mono PCM in -1..1. Notes overlap by addition and are clipped.
 * A 5 ms fade at each end keeps the click off the splice.
 */
export function renderMidiNotes(input: {
  notes: readonly MidiNote[];
  instrument: MidiInstrument;
  sampleRate: number;
  durationMs: number;
}): Float32Array {
  const sr = input.sampleRate;
  const length = Math.max(0, Math.floor((input.durationMs / 1000) * sr));
  const out = new Float32Array(length);
  if (length === 0 || !Number.isFinite(sr) || sr <= 0) return out;
  const fade = Math.max(1, Math.floor(sr * 0.005));
  for (const note of input.notes) {
    const start = Math.floor((note.t / 1000) * sr);
    const end = Math.min(length, Math.floor(((note.t + note.dur) / 1000) * sr));
    const span = end - start;
    if (span <= 0) continue;
    if (input.instrument === "scratch") {
      const voice = renderScratchNote(span, sr, note.pitch);
      const gain = note.vel * 0.85;
      for (let i = 0; i < voice.length && start + i < out.length; i++) {
        out[start + i] += (voice[i] ?? 0) * gain;
      }
      continue;
    }
    if (input.instrument === "drums" || isTonalInstrument(input.instrument)) {
      const piece = input.instrument === "drums"
        ? note.pitch <= 37 ? "kick" : note.pitch <= 40 ? "snare" : "hat"
        : input.instrument;
      const voice = renderInstrumentVoice({
        instrument: piece,
        hz: midiHz(note.pitch),
        length: span,
        sampleRate: sr,
      });
      const gain = note.vel * (input.instrument === "drums" ? 0.8 : 0.7);
      for (let i = 0; i < voice.length && start + i < out.length; i++) {
        out[start + i] += voice[i] * gain;
      }
      continue;
    }
    const hz = midiHz(note.pitch);
    for (let i = start; i < end; i++) {
      const k = i - start;
      let env = 1;
      if (k < fade) env = k / fade;
      else if (span - k < fade) env = Math.max(0, (span - k) / fade);
      out[i] += wave(input.instrument, (k * hz) / sr) * note.vel * 0.25 * env;
    }
  }
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
