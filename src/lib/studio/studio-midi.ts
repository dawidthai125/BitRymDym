/**
 * Studio instrument notes. Pure render shared by the browser preview and a later server mix:
 * one definition of the sample at time t. No I/O, no AudioContext.
 *
 * Notes sit on a project timeline in milliseconds. pitch is a MIDI note (69 = A4 = 440 Hz).
 * vel is 0..1. Before the note and after it ends the sample is 0.
 */

export const MIDI_INSTRUMENTS = ["sine", "square", "saw"] as const;
export type MidiInstrument = (typeof MIDI_INSTRUMENTS)[number];

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
  return v === "sine" || v === "square" || v === "saw";
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

/** C E G C, 400 ms, 40 ms gaps, sine, velocity 0.8, starting at the playhead. */
export function midiPhraseAt(playheadMs: number): StudioMidiV1 {
  const start = Math.max(0, Math.round(Number.isFinite(playheadMs) ? playheadMs : 0));
  const dur = 400;
  const gap = 40;
  const pitches = [60, 64, 67, 72] as const;
  return {
    v: MIDI_VERSION,
    instrument: "sine",
    notes: pitches.map((pitch, i) => ({ t: start + i * (dur + gap), dur, pitch, vel: 0.8 })),
  };
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
    const hz = midiHz(note.pitch);
    const span = end - start;
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
