import { describe, expect, it } from "vitest";

import { translateLibText } from "@/i18n/lib-text";
import type { MixAutofixNote } from "@/lib/studio/mix-autofix/plan";
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
      "Lead:odcięcie dołu 100 Hz",
      "Lead:kompresja 3:1",
      "Lead:bramka szumu ≤8 dB",
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

  it("has an English form of every Polish chip", () => {
    const keys = [
      "gainClipTrack", "gainMasterUp", "balanceVocalUp", "balanceVocalDown", "balanceSideUp", "balanceSideDown", "compLead", "duck",
      "eqVocalHighpass", "eqVocalPresence", "deesserSoft", "deesserStrong", "denoiseGate", "denoiseRumble", "panLeadCenter",
      "panLeft", "panRight", "pocket", "rider", "harmony", "voice", "tune", "chainFull",
    ];
    const notes = keys.map((key) => ({ key, params: { track: "T", db: 2, up: 4, down: 1.5, ratio: 3, hz: 100, pct: 30 } })) as unknown as MixAutofixNote[];
    const english = techChipsFromAutofixNotes(notes).map((c) => translateLibText(c.label, "en"));
    expect(english.length).toBeGreaterThanOrEqual(keys.length);
    const polish = /[ąćęłńóśźż]|\b(wokal|bit|poziom|kompresja|sybilanty|panorama|kieszeń|harmonia|zmiana|lekki|limit efektów|bramka)\b/i;
    expect(english.filter((label) => polish.test(label))).toEqual([]);
    expect(translateLibText("kompresja 3:1", "en")).toBe("compression 3:1");
    expect(translateLibText("kompresja 3:1", "pl")).toBe("kompresja 3:1");
  });
});
