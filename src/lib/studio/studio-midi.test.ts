import { describe, expect, it } from "vitest";

import { cleanMidiNotes, emptyMidi, hasMidi, midiHz, MidiValidationError, parseMidiForWrite, renderMidiNotes } from "./studio-midi";

describe("studio midi parser", () => {
  const code = (raw: unknown) => {
    try {
      parseMidiForWrite(raw);
      return "ok";
    } catch (e) {
      return e instanceof MidiValidationError ? e.code : "other";
    }
  };
  it("drops bad notes and rejects an unknown instrument", () => {
    const parsed = parseMidiForWrite({
      v: 1,
      instrument: "square",
      notes: [
        { t: 0, dur: 100, pitch: 60, vel: 0.5 },
        { t: 0, dur: 10, pitch: 200, vel: 1 },
        { t: -1, dur: 10, pitch: 60, vel: 1 },
      ],
    });
    expect(parsed.notes).toEqual([{ t: 0, dur: 100, pitch: 60, vel: 0.5 }]);
    expect(parsed.instrument).toBe("square");
    expect(code({ v: 1, instrument: "noise", notes: [] })).toBe("bad_instrument");
    expect(code({ v: 1, instrument: "sine", notes: Array.from({ length: 513 }, () => ({ t: 0, dur: 10, pitch: 60, vel: 1 })) })).toBe("too_many_notes");
    expect(hasMidi(parseMidiForWrite(null))).toBe(false);
    expect(parseMidiForWrite({ v: 1, instrument: "sine", notes: [] })).toEqual(emptyMidi());
  });
});

describe("studio midi", () => {
  it("maps MIDI 69 to 440 Hz", () => {
    expect(midiHz(69)).toBeCloseTo(440, 6);
    expect(midiHz(81)).toBeCloseTo(880, 4);
  });

  it("drops a note with a bad pitch and keeps a valid one", () => {
    expect(cleanMidiNotes([{ t: 0, dur: 100, pitch: 69, vel: 0.8 }, { t: 0, dur: 10, pitch: 200, vel: 1 }, "x"])).toEqual([
      { t: 0, dur: 100, pitch: 69, vel: 0.8 },
    ]);
  });

  it("renders a sine on the note and silence after it", () => {
    const pcm = renderMidiNotes({
      notes: [{ t: 0, dur: 200, pitch: 69, vel: 1 }],
      instrument: "sine",
      sampleRate: 8000,
      durationMs: 400,
    });
    const energy = (from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += pcm[i] * pcm[i];
      return s / (to - from);
    };
    expect(energy(80, 800)).toBeGreaterThan(0.01);
    expect(energy(2400, 3000)).toBe(0);
  });

  it("a higher pitch crosses zero more often", () => {
    const crossings = (pitch: number) => {
      const pcm = renderMidiNotes({
        notes: [{ t: 0, dur: 200, pitch, vel: 1 }],
        instrument: "sine",
        sampleRate: 8000,
        durationMs: 200,
      });
      let n = 0;
      for (let i = 40; i < pcm.length - 1; i++) if (pcm[i] <= 0 && pcm[i + 1] > 0) n += 1;
      return n;
    };
    expect(crossings(81)).toBeGreaterThan(crossings(69));
  });
});
