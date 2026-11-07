import { describe, expect, it } from "vitest";

import { bassLineAt, cleanMidiNotes, drumPatternAt, emptyMidi, hasMidi, midiHz, midiPhraseAt, MidiValidationError, parseMidiForWrite, renderMidiNotes } from "./studio-midi";
import { fadeEdgePreset } from "./studio-clip-fade";

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

  it("plays a piano that decays and a drum hit", () => {
    const energy = (pcm: Float32Array, from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += (pcm[i] ?? 0) ** 2;
      return s / (to - from);
    };
    const piano = renderMidiNotes({
      notes: [{ t: 0, dur: 800, pitch: 60, vel: 1 }],
      instrument: "piano",
      sampleRate: 8000,
      durationMs: 800,
    });
    expect(energy(piano, 80, 400)).toBeGreaterThan(energy(piano, 5600, 6200));
    const kick = renderMidiNotes({
      notes: [{ t: 0, dur: 300, pitch: 36, vel: 1 }],
      instrument: "drums",
      sampleRate: 8000,
      durationMs: 300,
    });
    expect(energy(kick, 40, 400)).toBeGreaterThan(0.01);
    expect(parseMidiForWrite({ v: 1, instrument: "piano", notes: [] }).instrument).toBe("piano");
  });

  it("writes a piano phrase, a bass line and a drum bar", () => {
    expect(midiPhraseAt(0).instrument).toBe("piano");
    expect(midiPhraseAt(0).notes.map((n) => n.pitch)).toEqual([60, 64, 67, 72]);
    const bass = bassLineAt(1000, 120);
    expect(bass.instrument).toBe("bass");
    expect(bass.notes).toHaveLength(4);
    expect(bass.notes[0]?.t).toBe(1000);
    const drums = drumPatternAt(0, 120);
    expect(drums.instrument).toBe("drums");
    expect(drums.notes.filter((n) => n.pitch === 36)).toHaveLength(2);
    expect(drums.notes.filter((n) => n.pitch === 38)).toHaveLength(2);
    expect(drums.notes.filter((n) => n.pitch === 42)).toHaveLength(8);
  });

  it("sets a short fade on one edge and keeps the other", () => {
    expect(fadeEdgePreset(10_000, "in", { fadeInMs: 0, fadeOutMs: 100 })).toEqual({
      fadeInMs: 800,
      fadeOutMs: 100,
    });
    expect(fadeEdgePreset(500, "out", { fadeInMs: 10, fadeOutMs: 0 })).toEqual({
      fadeInMs: 10,
      fadeOutMs: 40,
    });
    expect(fadeEdgePreset(0, "in", { fadeInMs: 0, fadeOutMs: 0 })).toEqual({
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  });
});
