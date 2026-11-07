import { describe, expect, it } from "vitest";

import { audioToMidiNotes, pickMidiTrackId } from "./audio-to-midi";

describe("audio to midi", () => {
  it("hears A4 as pitch 69", () => {
    const sr = 8000;
    const n = Math.floor(sr * 0.5);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.4;
    const notes = audioToMidiNotes(samples, sr, 0);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]?.pitch).toBe(69);
  });

  it("keeps notes off a vocal when an instrument track exists, and skips tracks that already have notes", () => {
    expect(
      pickMidiTrackId([
        { id: "beat", role: "beat", noteCount: 0 },
        { id: "vocal", role: "lead_vocal", noteCount: 0 },
        { id: "keys", role: "instrument", noteCount: 0 },
      ]),
    ).toBe("keys");
    expect(
      pickMidiTrackId([
        { id: "keys", role: "instrument", noteCount: 4 },
        { id: "vocal", role: "lead_vocal", noteCount: 0 },
      ]),
    ).toBeNull();
  });
});
