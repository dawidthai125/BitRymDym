import { describe, expect, it } from "vitest";

import { withConsistentWording } from "./consistency";
import type { BitekChatContext, BitekChatResult } from "./types";

const ctx: BitekChatContext = {
  lang: "pl",
  step: "mix",
  tracks: [
    { ref: "t1", name: "Bit", role: "beat", gainDb: -9, pan: 0, muted: false, hasAudio: true },
    { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 5.5, pan: 0, muted: false, hasAudio: true },
  ],
  analysis: null,
};
const res = (reply: string, value: number, why?: string): BitekChatResult => ({
  provider: "groq",
  reply,
  proposals: [{ trackRef: "t2", param: "gainDb", value, label: "Wokal: +5.5 → +4 dB (−1.5)", ...(why ? { why } : {}) }],
});

describe("withConsistentWording", () => {
  it("a reply that says 'podgłośniam' above a lowering proposal is rebuilt from the proposal", () => {
    const out = withConsistentWording(res("Podgłośniam wokal, żeby słowa przebijały się przez bit.", 4), ctx);
    expect(out.reply).toContain("Proponuję: Wokal: +5.5 → +4 dB");
    expect(out.reply).not.toContain("Podgłośniam");
  });
  it("a reply that says 'ściszę' above a raising proposal is rebuilt too", () => {
    expect(withConsistentWording(res("Ściszę wokal.", 7), ctx).reply).toContain("Proponuję:");
  });
  it("a matching reply, a mixed change and a different step are left alone", () => {
    expect(withConsistentWording(res("Ściszę wokal, żeby nie dominował.", 4), ctx).reply).toBe("Ściszę wokal, żeby nie dominował.");
    const mixed: BitekChatResult = {
      provider: "groq",
      reply: "Podgłośnię wokal i ściszę bit.",
      proposals: [
        { trackRef: "t2", param: "gainDb", value: 7, label: "" },
        { trackRef: "t1", param: "gainDb", value: -11, label: "" },
      ],
    };
    expect(withConsistentWording(mixed, ctx)).toBe(mixed);
    const master = { ...ctx, step: "master" as const };
    const r = res("Podgłośniam wokal.", 4);
    expect(withConsistentWording(r, master)).toBe(r);
  });
  it("a contradicting 'why' on one proposal is replaced by the server template", () => {
    const out = withConsistentWording(res("Ściszę wokal.", 4, "Podgłośniam wokal, żeby słowa przebijały się."), ctx);
    expect(out.proposals[0]!.why).toContain("Ściszam");
  });
});
