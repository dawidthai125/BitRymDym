/**
 * "Graj" computer-keyboard map. Uses KeyboardEvent.code (physical keys), so it works the same
 * on Polish, US and German layouts. Several keys can be held at once.
 *
 * Melodic instruments (piano, e-piano, bass, synths):
 *   white keys  A S D F G H J K L ; '   → C D E F G A B C D E F
 *   black keys  W E   T Y U   O P       → C# D#  F# G# A#  C# D#
 *   Z / X       octave down / up
 *   Space       sustain pedal (held)
 * Drum pads:    Q W E R / A S D F       → pads 1–8 (Z X C V / U I O P reserved for 16 pads)
 * Guitar:       1–8 chord, Space strum down, Enter strum up
 */

const WHITE: Record<string, number> = {
  KeyA: 0,
  KeyS: 2,
  KeyD: 4,
  KeyF: 5,
  KeyG: 7,
  KeyH: 9,
  KeyJ: 11,
  KeyK: 12,
  KeyL: 14,
  Semicolon: 16,
  Quote: 17,
};

const BLACK: Record<string, number> = {
  KeyW: 1,
  KeyE: 3,
  KeyT: 6,
  KeyY: 8,
  KeyU: 10,
  KeyO: 13,
  KeyP: 15,
};

export const PAD_CODES = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyU", "KeyI", "KeyO", "KeyP"] as const;

export const CHORD_CODES = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8"] as const;

export const MIN_BASE_NOTE = 24; // C1
export const MAX_BASE_NOTE = 84; // C6

/** MIDI note for a key at the given octave base (a C), or null when the key plays nothing. */
export function noteForCode(code: string, baseNote: number): number | null {
  const off = WHITE[code] ?? BLACK[code];
  if (off == null) return null;
  const n = baseNote + off;
  return n >= 0 && n <= 127 ? n : null;
}

/** Octave change for Z (down) / X (up); null for any other key. */
export function octaveShiftForCode(code: string): -1 | 1 | null {
  if (code === "KeyZ") return -1;
  if (code === "KeyX") return 1;
  return null;
}

export function shiftBaseNote(baseNote: number, dir: -1 | 1): number {
  return Math.max(MIN_BASE_NOTE, Math.min(MAX_BASE_NOTE, baseNote + dir * 12));
}

/** Pad index 0–15 for a key, limited to `pads` pads. */
export function padForCode(code: string, pads = 8): number | null {
  const i = (PAD_CODES as readonly string[]).indexOf(code);
  return i >= 0 && i < pads ? i : null;
}

export function chordIndexForCode(code: string): number | null {
  const i = (CHORD_CODES as readonly string[]).indexOf(code);
  return i >= 0 ? i : null;
}

/** Short visible label of the computer key for an on-screen key (offset from the base C). */
export function keyLabelForOffset(offset: number): string | null {
  for (const [code, off] of Object.entries({ ...WHITE, ...BLACK })) {
    if (off === offset) return codeLabel(code);
  }
  return null;
}

export function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Semicolon") return ";";
  if (code === "Quote") return "'";
  if (code === "Space") return "Spacja";
  return code;
}

/** True for keys the play studio handles, so the page does not scroll or type. */
export function isPlayKey(code: string): boolean {
  return (
    code in WHITE ||
    code in BLACK ||
    code === "KeyZ" ||
    code === "KeyX" ||
    code === "Space" ||
    code === "Enter" ||
    (PAD_CODES as readonly string[]).includes(code) ||
    (CHORD_CODES as readonly string[]).includes(code)
  );
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteName(n: number): string {
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

export function isBlackKey(n: number): boolean {
  return [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
}
