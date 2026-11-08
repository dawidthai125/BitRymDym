import { describe, expect, it } from "vitest";

import { appendPlayedNote, bassLineAt, clampRollOrigin, cleanMidiNotes, drumPatternAt, emptyMidi, hasMidi, midiHz, midiPhraseAt, MidiValidationError, parseMidiForWrite, renderMidiNotes, renderMidiSampleWav, reviewPlayedNotes, rollBarSpan, rollPage, rollPitches, rollStepMs, scratchPatternAt, toggleGridNote } from "./studio-midi";
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

  it("records key clicks on the beat and refuses a second instrument", () => {
    const first = appendPlayedNote({ midi: null, instrument: "piano", pitch: 60, playheadMs: 150, bpm: 120 });
    expect(first.ok && first.midi.notes.map((n) => n.t)).toEqual([0]);
    const second = appendPlayedNote({
      midi: first.ok ? first.midi : null,
      instrument: "piano",
      pitch: 64,
      playheadMs: 0,
      bpm: 120,
    });
    expect(second.ok && second.midi.notes.map((n) => n.t)).toEqual([0, 500]);
    const blocked = appendPlayedNote({
      midi: second.ok ? second.midi : null,
      instrument: "guitar",
      pitch: 52,
      playheadMs: 0,
      bpm: 120,
    });
    expect(blocked.ok).toBe(false);
    const chord = appendPlayedNote({
      midi: first.ok ? first.midi : null,
      instrument: "piano",
      pitch: 64,
      playheadMs: 0,
      bpm: 120,
      sinceMs: 40,
    });
    expect(chord.ok && chord.midi.notes.map((n) => n.t)).toEqual([0, 0]);
    const rested = appendPlayedNote({
      midi: first.ok ? first.midi : null,
      instrument: "piano",
      pitch: 67,
      playheadMs: 0,
      bpm: 120,
      sinceMs: 1000,
    });
    expect(rested.ok && rested.midi.notes.map((n) => n.t)).toEqual([0, 1000]);
    const hats = appendPlayedNote({
      midi: { v: 1, instrument: "drums", notes: [{ t: 0, dur: 200, pitch: 42, vel: 0.9 }] },
      instrument: "drums",
      pitch: 42,
      playheadMs: 0,
      bpm: 120,
      gridBeats: 0.5,
    });
    expect(hats.ok && hats.midi.notes.map((n) => n.t)).toEqual([0, 250]);
    const guitar = renderMidiNotes({
      notes: [{ t: 0, dur: 400, pitch: 64, vel: 1 }],
      instrument: "guitar",
      sampleRate: 8000,
      durationMs: 400,
    });
    expect(guitar.some((sample) => Math.abs(sample) > 0.05)).toBe(true);
  });

  it("drops a scratch bar on the track and keeps an older scratch bar", () => {
    const bar = scratchPatternAt(100, 120);
    expect(bar.instrument).toBe("scratch");
    expect(bar.notes.length).toBe(3);
    expect(bar.notes[0]?.t).toBe(600);
    const again = scratchPatternAt(2000, 120, bar);
    expect(again.notes.length).toBe(6);
    expect(scratchPatternAt(0, 120, { v: 1, instrument: "piano", notes: [{ t: 0, dur: 100, pitch: 60, vel: 0.8 }] }).notes.length).toBe(3);
    const pcm = renderMidiNotes({
      notes: bar.notes,
      instrument: "scratch",
      sampleRate: 8000,
      durationMs: 2500,
    });
    expect(pcm.some((sample) => Math.abs(sample) > 0.05)).toBe(true);
    expect(parseMidiForWrite(bar).instrument).toBe("scratch");
    const wav = renderMidiSampleWav(bar);
    expect(wav && String.fromCharCode(...wav.bytes.slice(0, 4))).toBe("RIFF");
    expect(wav && wav.durationMs).toBeGreaterThanOrEqual(1000);
  });

  it("shifts the piano roll by an octave and leaves drums in place", () => {
    expect(rollPitches("piano", 0)).toEqual([72, 71, 69, 67, 65, 64, 62, 60]);
    expect(rollPitches("piano", 1)).toEqual([84, 83, 81, 79, 77, 76, 74, 72]);
    expect(rollPitches("piano", -1)).toEqual([60, 59, 57, 55, 53, 52, 50, 48]);
    expect(rollPitches("drums", 2)).toEqual([42, 38, 36]);
    expect(rollPitches("piano", 20)).toEqual([72, 71, 69, 67, 65, 64, 62, 60]);
  });

  it("toggles one eighth on the piano roll without wiping another instrument", () => {
    const placed = toggleGridNote({
      midi: null,
      instrument: "piano",
      pitch: 60,
      step: 0,
      playheadMs: 0,
      bpm: 120,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.midi.notes).toEqual([{ t: 0, dur: 225, pitch: 60, vel: 0.8 }]);
    const off = toggleGridNote({
      midi: placed.midi,
      instrument: "piano",
      pitch: 60,
      step: 0,
      playheadMs: 0,
      bpm: 120,
    });
    expect(off.ok && off.midi.notes).toEqual([]);
    expect(
      toggleGridNote({
        midi: { v: 1, instrument: "guitar", notes: [{ t: 0, dur: 100, pitch: 64, vel: 0.8 }] },
        instrument: "piano",
        pitch: 60,
        step: 1,
        playheadMs: 0,
        bpm: 120,
      }),
    ).toEqual({ ok: false, reason: "other" });
  });

  it("pages two bars at a time and stays inside the timeline", () => {
    expect(rollPage(0, -1, 120)).toBe(0);
    expect(rollPage(0, 1, 120)).toBe(4000);
    const placed = toggleGridNote({
      midi: null,
      instrument: "piano",
      pitch: 60,
      step: 0,
      playheadMs: 4000,
      bpm: 120,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.midi.notes).toEqual([{ t: 4000, dur: 225, pitch: 60, vel: 0.8 }]);
    expect(rollBarSpan(0, 120)).toEqual({ fromBar: 1, toBar: 2 });
    expect(rollBarSpan(4000, 120)).toEqual({ fromBar: 3, toBar: 4 });
    const end = clampRollOrigin(3_600_001, 120);
    expect(end + 16 * rollStepMs(120)).toBeLessThanOrEqual(3_600_000);
    expect(rollPage(end, 1, 120)).toBe(end);
  });

  it("tells BITEK when a line is short, stuck, leaping, or ready", () => {
    const note = (pitch: number) => ({ t: 0, dur: 100, pitch, vel: 0.8 });
    expect(reviewPlayedNotes(null)).toBeNull();
    expect(reviewPlayedNotes({ v: 1, instrument: "sine", notes: [note(60)] })).toBeNull();
    expect(reviewPlayedNotes({ v: 1, instrument: "piano", notes: [note(60), note(62)] })?.code).toBe("short");
    expect(reviewPlayedNotes({ v: 1, instrument: "piano", notes: [note(60), note(60), note(60), note(60)] })?.code).toBe("same");
    expect(reviewPlayedNotes({ v: 1, instrument: "guitar", notes: [note(52), note(64), note(52), note(64)] })?.code).toBe("leap");
    expect(reviewPlayedNotes({ v: 1, instrument: "piano", notes: [note(60), note(64), note(67), note(72)] })?.code).toBe("line-ok");
    expect(reviewPlayedNotes({ v: 1, instrument: "drums", notes: [note(36), note(36)] })?.code).toBe("drums-one");
    expect(reviewPlayedNotes({ v: 1, instrument: "drums", notes: [note(36), note(38), note(42), note(36)] })?.code).toBe("drums-ok");
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
