import { describe, expect, it } from "vitest";

import { withMeasurementCaution } from "./caution";
import type { BitekChatContext, BitekChatResult } from "./types";

const ctx = (balance: string | null, stale = false, step: "mix" | "master" = "mix"): BitekChatContext => ({
  lang: "pl",
  step,
  tracks: [
    { ref: "t1", name: "Bit", role: "beat", gainDb: -9, pan: 0, muted: false, hasAudio: true },
    { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 3.5, pan: 0, muted: false, hasAudio: true },
  ],
  analysis: { overall: "yellow", stale, cards: balance ? [{ id: "balance", status: "yellow", value: balance }] : [], masterIntegratedLufs: -20, masterTruePeakDbtp: -3 },
});
const up = (value: number): BitekChatResult => ({ provider: "rules", reply: "Podgłośnię wokal.", proposals: [{ trackRef: "t2", param: "gainDb", value, label: "" }] });

describe("withMeasurementCaution", () => {
  it("warns when raising a vocal that is already louder than the beat", () => {
    const out = withMeasurementCaution(up(5.5), ctx("+3.1 LU"));
    expect(out.reply).toContain("o +3.1 LU głośniejszy od bitu");
    expect(out.proposals).toHaveLength(1);
  });
  it("stays silent when the balance is fine, stale, missing or the vocal is lowered", () => {
    expect(withMeasurementCaution(up(5.5), ctx("+1.2 LU")).reply).toBe("Podgłośnię wokal.");
    expect(withMeasurementCaution(up(5.5), ctx("+3.1 LU", true)).reply).toBe("Podgłośnię wokal.");
    expect(withMeasurementCaution(up(5.5), ctx(null)).reply).toBe("Podgłośnię wokal.");
    expect(withMeasurementCaution(up(2), ctx("+3.1 LU")).reply).toBe("Podgłośnię wokal.");
    expect(withMeasurementCaution(up(5.5), ctx("+3.1 LU", false, "master")).reply).toBe("Podgłośnię wokal.");
  });
  it("stays silent when the reply already warns from the measurement", () => {
    const warned: BitekChatResult = { ...up(5.5), reply: "Podgłośnię wokal, ale z pomiaru jest już o 3,3 LU głośniejszy od bitu, więc jak będzie za blisko, cofnij." };
    expect(withMeasurementCaution(warned, ctx("+3.1 LU")).reply).toBe(warned.reply);
  });
  it("does not repeat itself", () => {
    const once = withMeasurementCaution(up(5.5), ctx("+3.1 LU"));
    expect(withMeasurementCaution(once, ctx("+3.1 LU")).reply).toBe(once.reply);
  });
});
