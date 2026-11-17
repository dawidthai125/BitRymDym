import { describe, expect, it } from "vitest";

import { groupTechChipsByTrack, techChipsFromAutofixNotes } from "@/lib/studio/mix-autofix/tech-log";

describe("techChipsFromAutofixNotes", () => {
  it("maps EQ / comp / gate notes to short labels", () => {
    const chips = techChipsFromAutofixNotes([
      { key: "eqVocalHighpass", params: { track: "Lead", hz: 100 } },
      { key: "compLead", params: { track: "Lead", ratio: 3 } },
      { key: "denoiseGate", params: { track: "Lead", db: 8 } },
      { key: "eqBeatCut", params: { track: "Beat", db: 1.5 } },
    ]);
    expect(chips.map((c) => `${c.track}:${c.label}`)).toEqual([
      "Lead:HPF 100 Hz",
      "Lead:comp 3:1",
      "Lead:gate ≤8 dB",
      "Beat:EQ −1.5 dB @ 2.5 kHz",
    ]);
  });

  it("groups by track with whole-mix last when null", () => {
    const chips = techChipsFromAutofixNotes([
      { key: "pocket", params: {} },
      { key: "compLead", params: { track: "Vox", ratio: 2.5 } },
    ]);
    const groups = groupTechChipsByTrack(chips);
    expect(groups[0]?.track).toBeNull();
    expect(groups[1]?.track).toBe("Vox");
  });

  it("skips unknown note keys", () => {
    expect(techChipsFromAutofixNotes([{ key: "unknownThing", params: {} }])).toEqual([]);
  });
});
