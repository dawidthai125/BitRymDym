/**
 * "Graj" (play) module — shared contract between the instrument engine, the recorder,
 * Sampek (the sample assistant) and saving. Pure types and constants only.
 *
 * Time is in BEATS from the start of the loop (quarter notes), so tempo changes and
 * quantizing are exact. A recording is a list of note events per layer, not audio:
 * Sampek edits the notes, then the browser renders the final WAV offline.
 */

/** Sample-based instruments live in /public/instruments/<id>/manifest.json (see CREDITS.txt). */
export const SAMPLED_INSTRUMENTS = ["piano", "epiano", "guitar", "bass"] as const;
/** Drum kits: pads in manifest order; a note's `n` is the pad index. */
export const DRUM_KITS = ["hiphop", "drums"] as const;
/** Web Audio synths (no files). */
export const SYNTHS = ["synth-lead", "synth-pad", "synth-bass"] as const;

export type SampledInstrumentId = (typeof SAMPLED_INSTRUMENTS)[number];
export type DrumKitId = (typeof DRUM_KITS)[number];
export type SynthId = (typeof SYNTHS)[number];
export type PlayInstrumentId = SampledInstrumentId | DrumKitId | SynthId;

export type SynthParams = {
  wave: "sine" | "triangle" | "sawtooth" | "square";
  /** Low-pass cutoff in Hz. */
  cutoff: number;
  /** 0–20 resonance (Q). */
  resonance: number;
  attack: number;
  release: number;
  /** Portamento in seconds (0 = none). */
  glide: number;
  /** Detuned second oscillator in cents (0 = off). */
  detune: number;
};

export type PlayNote = {
  /** Start, in beats from the loop start (>= 0). */
  t: number;
  /** Length in beats (> 0). For drums the hit length is ignored. */
  d: number;
  /** MIDI note number (melodic) or pad index (drum kit). */
  n: number;
  /** Velocity 0–1. */
  v: number;
};

export type PlayLayer = {
  id: string;
  instrument: PlayInstrumentId;
  notes: PlayNote[];
  /** Linear gain 0–1.5. */
  gain: number;
  muted?: boolean;
  synth?: SynthParams;
};

export type PlaySession = {
  bpm: number;
  /** Loop length in 4/4 bars (1, 2, 4, 8). */
  bars: number;
  /** "Am", "F#" … or null when unknown. */
  key: string | null;
  /** Swing 0–0.6 applied to off-beat 1/16 or 1/8 at render. */
  swing: number;
  layers: PlayLayer[];
  /** Catalog beat the tempo came from, if any. */
  beatId?: string | null;
};

/** Sampek (sample assistant) result: a new session plus what changed, in Polish. */
export type SampekResult = {
  session: PlaySession;
  /** Short Polish lines, e.g. "Wyrównałem 14 nut do 1/16". */
  changes: string[];
};

export const PLAY_BEATS_PER_BAR = 4;
export const PLAY_MAX_LAYERS = 6;
export const PLAY_MAX_NOTES_PER_LAYER = 512;

export function sessionBeats(s: Pick<PlaySession, "bars">): number {
  return s.bars * PLAY_BEATS_PER_BAR;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}
