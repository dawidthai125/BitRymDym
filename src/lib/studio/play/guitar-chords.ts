/**
 * Guitar chords for "Graj": standard tuning, voicings as frets per string (low E → high E),
 * null = string not played. Strumming turns a chord into notes with small time offsets.
 */

/** Open strings, low E to high E (MIDI). */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64] as const;

export type GuitarChord = { id: string; frets: (number | null)[] };

export const GUITAR_CHORDS: readonly GuitarChord[] = [
  { id: "C", frets: [null, 3, 2, 0, 1, 0] },
  { id: "Am", frets: [null, 0, 2, 2, 1, 0] },
  { id: "F", frets: [1, 3, 3, 2, 1, 1] },
  { id: "G", frets: [3, 2, 0, 0, 0, 3] },
  { id: "Dm", frets: [null, null, 0, 2, 3, 1] },
  { id: "Em", frets: [0, 2, 2, 0, 0, 0] },
  { id: "E", frets: [0, 2, 2, 1, 0, 0] },
  { id: "A", frets: [null, 0, 2, 2, 2, 0] },
  { id: "D", frets: [null, null, 0, 2, 3, 2] },
  { id: "Bm", frets: [null, 2, 4, 4, 3, 2] },
  { id: "C7", frets: [null, 3, 2, 3, 1, 0] },
  { id: "A7", frets: [null, 0, 2, 0, 2, 0] },
  { id: "D7", frets: [null, null, 0, 2, 1, 2] },
  { id: "E7", frets: [0, 2, 0, 1, 0, 0] },
  { id: "G7", frets: [3, 2, 0, 0, 0, 1] },
  { id: "Am7", frets: [null, 0, 2, 0, 1, 0] },
  { id: "Dm7", frets: [null, null, 0, 2, 1, 1] },
  { id: "Em7", frets: [0, 2, 0, 0, 0, 0] },
  { id: "Fmaj7", frets: [null, null, 3, 2, 1, 0] },
  { id: "Cmaj7", frets: [null, 3, 2, 0, 0, 0] },
];

/** The 8 chords on keys 1–8 by default (a common minor-friendly hip-hop set). */
export const DEFAULT_CHORD_SET = ["Am", "Dm", "Em", "F", "G", "C", "E7", "Fmaj7"] as const;

export function findChord(id: string): GuitarChord | null {
  return GUITAR_CHORDS.find((c) => c.id === id) ?? null;
}

/** MIDI note of each string for a chord (null = muted string). */
export function chordNotes(chord: GuitarChord): (number | null)[] {
  return chord.frets.map((f, i) => (f == null ? null : GUITAR_TUNING[i]! + f));
}

export type StrumHit = { string: number; note: number; offsetMs: number; velocity: number };

/**
 * Spacing between strings: a fast flick is tight (8 ms), a slow drag is wide (35 ms).
 * `speed` is pointer speed in px/ms (keyboard strum ≈ 1.2).
 */
export function strumSpacingMs(speed: number): number {
  const s = Math.max(0, speed);
  return Math.round(Math.max(8, Math.min(35, 35 - s * 18)));
}

export function strumVelocity(speed: number): number {
  return Math.round(Math.max(0.3, Math.min(1, 0.35 + speed * 0.45)) * 100) / 100;
}

/**
 * Strum a chord. Down = low string first (as on a real guitar), up = high string first and a
 * touch softer. `strings` limits which strings were crossed (drag), default all.
 */
export function strum(
  chord: GuitarChord,
  direction: "down" | "up",
  speed: number,
  strings: number[] = [0, 1, 2, 3, 4, 5],
): StrumHit[] {
  const notes = chordNotes(chord);
  const order = [...new Set(strings)].filter((s) => s >= 0 && s < 6).sort((a, b) => (direction === "down" ? a - b : b - a));
  const spacing = strumSpacingMs(speed);
  const base = strumVelocity(speed) * (direction === "up" ? 0.85 : 1);
  const hits: StrumHit[] = [];
  for (const s of order) {
    const note = notes[s];
    if (note == null) continue;
    hits.push({ string: s, note, offsetMs: hits.length * spacing, velocity: Math.round(base * 100) / 100 });
  }
  return hits;
}

/** Note of one plucked string for the selected chord (open string when muted). */
export function pluckNote(chord: GuitarChord, string: number): number {
  const n = chordNotes(chord)[string];
  return n ?? GUITAR_TUNING[string]!;
}
