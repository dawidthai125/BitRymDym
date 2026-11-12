import { describe, expect, it } from "vitest";
import { MIDI_VERSION } from "@/lib/studio/studio-midi";
import { hasOwnContent } from "./own-content";

const beat = { source_kind: "BEAT_REF", muted: false, duration_ms: 60000 };
describe("hasOwnContent (no export of the clean Bit)", () => {
  it("only the Bit clip → false", () => {
    expect(hasOwnContent([beat], [{ midi: null }])).toBe(false);
    expect(hasOwnContent([], [])).toBe(false);
  });
  it("a recorded take or imported stem counts", () => {
    expect(hasOwnContent([beat, { source_kind: "TAKE", muted: false, duration_ms: 3000 }], [])).toBe(true);
    expect(hasOwnContent([beat, { source_kind: "ARTIFACT", muted: false, duration_ms: 3000 }], [])).toBe(true);
  });
  it("a muted or empty take does not count", () => {
    expect(hasOwnContent([beat, { source_kind: "TAKE", muted: true, duration_ms: 3000 }], [])).toBe(false);
    expect(hasOwnContent([beat, { source_kind: "TAKE", muted: false, duration_ms: 0 }], [])).toBe(false);
  });
  it("instrument notes count", () => {
    const midi = { v: MIDI_VERSION, instrument: "piano", notes: [{ t: 0, dur: 500, pitch: 60, vel: 0.8 }] };
    expect(hasOwnContent([beat], [{ midi }])).toBe(true);
    expect(hasOwnContent([beat], [{ midi: { v: MIDI_VERSION, instrument: "piano", notes: [] } }])).toBe(false);
  });
});
