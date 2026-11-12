import { describe, expect, it, vi } from "vitest";

import {
  bindMidiNoteOns,
  computerKeyPitch,
  midiNoteOnPitch,
  octaveNudge,
  type MidiNotePort,
} from "@/lib/studio/studio-play-input";

describe("computerKeyPitch", () => {
  it("plays two octaves from Z and Q, with S as C#", () => {
    expect(computerKeyPitch("KeyZ", "piano", 0)).toBe(60);
    expect(computerKeyPitch("KeyS", "piano", 0)).toBe(61);
    expect(computerKeyPitch("KeyQ", "piano", 0)).toBe(72);
    expect(computerKeyPitch("Digit2", "piano", 0)).toBe(73);
    expect(computerKeyPitch("KeyI", "piano", 0)).toBe(84);
  });

  it("shifts only the computer keyboard by octave", () => {
    expect(computerKeyPitch("KeyZ", "piano", 1)).toBe(72);
    expect(computerKeyPitch("KeyZ", "piano", -1)).toBe(48);
    expect(computerKeyPitch("KeyZ", "piano", 9)).toBe(60 + 3 * 12);
  });

  it("starts guitar one octave down and bass two", () => {
    expect(computerKeyPitch("KeyZ", "guitar", 0)).toBe(48);
    expect(computerKeyPitch("KeyZ", "bass", 0)).toBe(36);
  });

  it("maps drum keys to the three pads and ignores piano keys", () => {
    expect(computerKeyPitch("KeyZ", "drums", 2)).toBe(36);
    expect(computerKeyPitch("KeyX", "drums", 0)).toBe(38);
    expect(computerKeyPitch("KeyC", "drums", 0)).toBe(42);
    expect(computerKeyPitch("Digit1", "drums", 0)).toBe(36);
    expect(computerKeyPitch("KeyQ", "drums", 0)).toBeNull();
  });

  it("stays inside MIDI notes at the octave stops", () => {
    expect(computerKeyPitch("KeyZ", "bass", -3)).toBe(0);
    expect(computerKeyPitch("KeyI", "piano", 3)).toBe(120);
  });
});

describe("octaveNudge", () => {
  it("uses the bracket keys", () => {
    expect(octaveNudge("BracketLeft")).toBe(-1);
    expect(octaveNudge("BracketRight")).toBe(1);
    expect(octaveNudge("KeyZ")).toBeNull();
  });
});

describe("midiNoteOnPitch", () => {
  it("accepts a note-on and ignores note-off", () => {
    expect(midiNoteOnPitch(0x90, 60, 100, "piano")).toBe(60);
    expect(midiNoteOnPitch(0x91, 40, 1, "guitar")).toBe(40);
    expect(midiNoteOnPitch(0x90, 60, 0, "piano")).toBeNull();
    expect(midiNoteOnPitch(0x80, 60, 100, "piano")).toBeNull();
    expect(midiNoteOnPitch(0x90, 200, 10, "piano")).toBeNull();
  });

  it("folds a drum controller onto kick, snare, and hat", () => {
    expect(midiNoteOnPitch(0x90, 36, 127, "drums")).toBe(36);
    expect(midiNoteOnPitch(0x90, 40, 10, "drums")).toBe(38);
    expect(midiNoteOnPitch(0x90, 46, 10, "drums")).toBe(42);
    expect(midiNoteOnPitch(0x90, 64, 10, "drums")).toBe(42);
  });
});

describe("bindMidiNoteOns", () => {
  it("plays the current instrument and unsubscribes", () => {
    let listener: ((event: { data?: Uint8Array | null }) => void) | null = null;
    const input: MidiNotePort = {
      name: "Pad",
      addEventListener: (_type, fn) => {
        listener = fn;
      },
      removeEventListener: () => {
        listener = null;
      },
    };
    let instrument: "piano" | "drums" = "piano";
    const onPitch = vi.fn();
    const stop = bindMidiNoteOns([input], () => instrument, onPitch);
    listener?.({ data: new Uint8Array([0x90, 60, 80]) });
    instrument = "drums";
    listener?.({ data: new Uint8Array([0x90, 36, 80]) });
    listener?.({ data: new Uint8Array([0x80, 36, 0]) });
    expect(onPitch.mock.calls).toEqual([[60], [36]]);
    stop();
    listener?.({ data: new Uint8Array([0x90, 62, 80]) });
    expect(onPitch).toHaveBeenCalledTimes(2);
  });
});
