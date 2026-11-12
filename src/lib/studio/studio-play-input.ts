/** Computer keys and Web MIDI for the instrument panel. Same pitches as a click. No audio. */

export type PlaySurface = "piano" | "guitar" | "bass" | "drums";

/** Z is C. Piano starts at C4, guitar one octave down, bass two. */
const TONAL_BASE: Record<Exclude<PlaySurface, "drums">, number> = {
  piano: 60,
  guitar: 48,
  bass: 36,
};

/** Physical key (event.code) → semitone above the instrument base. Two octaves. */
const CHROMATIC: Record<string, number> = {
  KeyZ: 0,
  KeyS: 1,
  KeyX: 2,
  KeyD: 3,
  KeyC: 4,
  KeyV: 5,
  KeyG: 6,
  KeyB: 7,
  KeyH: 8,
  KeyN: 9,
  KeyJ: 10,
  KeyM: 11,
  KeyQ: 12,
  Digit2: 13,
  KeyW: 14,
  Digit3: 15,
  KeyE: 16,
  KeyR: 17,
  Digit5: 18,
  KeyT: 19,
  Digit6: 20,
  KeyY: 21,
  Digit7: 22,
  KeyU: 23,
  KeyI: 24,
};

/** Pads: Z kick, X snare, C hat. A S D and 1 2 3 are the same three hits. */
const DRUMS: Record<string, number> = {
  KeyZ: 36,
  KeyA: 36,
  Digit1: 36,
  KeyX: 38,
  KeyS: 38,
  Digit2: 38,
  KeyC: 42,
  KeyD: 42,
  Digit3: 42,
};

const OCTAVE_MIN = -3;
const OCTAVE_MAX = 3;

export function clampPlayOctave(shift: number): number {
  if (!Number.isFinite(shift)) return 0;
  return Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, Math.trunc(shift)));
}

/** Bracket keys move the computer keyboard only. A MIDI controller has its own octave. */
export function octaveNudge(code: string): -1 | 1 | null {
  if (code === "BracketLeft") return -1;
  if (code === "BracketRight") return 1;
  return null;
}

export function computerKeyPitch(code: string, instrument: PlaySurface, octaveShift: number): number | null {
  if (instrument === "drums") return DRUMS[code] ?? null;
  const semi = CHROMATIC[code];
  if (semi == null) return null;
  const pitch = TONAL_BASE[instrument] + semi + clampPlayOctave(octaveShift) * 12;
  if (pitch < 0 || pitch > 127) return null;
  return pitch;
}

/**
 * Note-on only (status 0x9n, velocity > 0). Note-off and velocity 0 are ignored:
 * a click also starts a fixed hit, it does not hold the note.
 * Drums collapse to the three pads the panel already draws.
 */
export function midiNoteOnPitch(
  status: number,
  note: number,
  velocity: number,
  instrument: PlaySurface,
): number | null {
  if (!Number.isInteger(status) || !Number.isInteger(note) || !Number.isInteger(velocity)) return null;
  if ((status & 0xf0) !== 0x90 || velocity <= 0) return null;
  if (note < 0 || note > 127) return null;
  if (instrument !== "drums") return note;
  if (note <= 37) return 36;
  if (note <= 40) return 38;
  return 42;
}

export type MidiByteEvent = { data?: Uint8Array | null };

export type MidiNotePort = {
  name?: string | null;
  addEventListener(type: "midimessage", listener: (event: MidiByteEvent) => void): void;
  removeEventListener(type: "midimessage", listener: (event: MidiByteEvent) => void): void;
};

/** Subscribe to note-ons. The instrument reader runs at event time. Returns unsubscribe. */
export function bindMidiNoteOns(
  inputs: Iterable<MidiNotePort>,
  instrument: PlaySurface | (() => PlaySurface),
  onPitch: (pitch: number) => void,
): () => void {
  const read = typeof instrument === "function" ? instrument : () => instrument;
  const offs: Array<() => void> = [];
  for (const input of inputs) {
    const listener = (event: MidiByteEvent) => {
      const data = event.data;
      if (!data || data.length < 3) return;
      const pitch = midiNoteOnPitch(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, read());
      if (pitch == null) return;
      onPitch(pitch);
    };
    input.addEventListener("midimessage", listener);
    offs.push(() => input.removeEventListener("midimessage", listener));
  }
  return () => {
    for (const off of offs) off();
  };
}
