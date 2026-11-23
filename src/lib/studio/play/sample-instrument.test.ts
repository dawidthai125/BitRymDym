import { describe, expect, it } from "vitest";

import { DRUM_KITS, SAMPLED_INSTRUMENTS, SYNTHS } from "@/lib/studio/play/play-types";
import { instrumentKind, isSampleInstrumentId } from "@/lib/studio/samples/sample-policy";

import { recordedNote, sampleInstrumentForPlay } from "./sample-instrument";

describe("Graj → saved sample", () => {
  it.each([...SAMPLED_INSTRUMENTS, ...DRUM_KITS, ...SYNTHS])("%s maps to an instrument the server accepts, with its kind", (id) => {
    const { instrument, kind } = sampleInstrumentForPlay(id);
    expect(isSampleInstrumentId(instrument)).toBe(true);
    expect(kind).toBe(instrumentKind(instrument));
  });

  it("a note from the second pass lands inside the loop and never runs past its end", () => {
    expect(recordedNote(9.5, 10, 8)).toEqual({ t: 1.5, d: 0.5 });
    expect(recordedNote(7.5, 9.5, 8)).toEqual({ t: 7.5, d: 0.5 });
    expect(recordedNote(-0.5, 0.5, 8)).toEqual({ t: 0, d: 0.5 });
  });
});
