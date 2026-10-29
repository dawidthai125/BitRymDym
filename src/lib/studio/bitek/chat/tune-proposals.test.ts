import { describe, expect, it } from "vitest";

import { addStudioFxToChain, emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

import { bitekTuneLevelOf } from "./client-context";
import { bitekRulesChat } from "./intents";
import { buildBitekSystemPrompt } from "./prompt";
import { validateProposals } from "./proposals";
import { resolveBitekRelative } from "./relative";
import { parseBitekChatRequest } from "./request";
import { bitekTuneChain } from "./tune-apply";
import type { BitekChatContext } from "./types";

const ctx = (over: Partial<BitekChatContext> = {}): BitekChatContext => ({
  lang: "pl",
  step: "mix",
  tracks: [
    { ref: "t1", name: "Bit", role: "beat", gainDb: 0, pan: 0, muted: false },
    { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: -3, pan: 0, muted: false, tune: 0 },
  ],
  analysis: null,
  ...over,
});
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("BITEK × BRD Tune", () => {
  it("validates tune proposals: vocal tracks only, levels 0/1/2, no-ops skipped", () => {
    const out = validateProposals(
      [
        { trackRef: "t2", param: "tune", value: 2 },
        { trackRef: "t1", param: "tune", value: 1 },
        { trackRef: "t2", param: "tune", value: 5 },
      ],
      ctx(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ trackRef: "t2", param: "tune", value: 2, label: "Wokal: strojenie wył. → twarde (trap)" });
    expect(out[0]!.why).toMatch(/twarde strojenie/);
    expect(validateProposals([{ trackRef: "t2", param: "tune", value: 0 }], ctx())).toEqual([]);
  });

  it("rules brain: 'nastrój wokal' / 'autotune trap' / 'wyłącz strojenie'", () => {
    expect(bitekRulesChat("nastrój wokal", ctx()).proposals[0]).toMatchObject({ param: "tune", value: 1 });
    expect(bitekRulesChat("daj autotune jak w trapie", ctx()).proposals[0]).toMatchObject({ param: "tune", value: 2 });
    const off = bitekRulesChat("wyłącz strojenie", ctx({ tracks: [{ ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false, tune: 1 }] }));
    expect(off.proposals[0]).toMatchObject({ param: "tune", value: 0 });
  });

  it("prompt lists the tune param and the track state; request parser keeps it", () => {
    expect(buildBitekSystemPrompt(ctx())).toContain('"tune"');
    expect(buildBitekSystemPrompt(ctx())).toContain('"tune":0');
    const req = parseBitekChatRequest({
      message: "więcej",
      context: { ...ctx(), lastChange: [{ trackRef: "t2", param: "tune", from: 0, to: 1 }] },
    });
    expect(req.ok && req.value.context.tracks[1]!.tune).toBe(0);
    expect(req.ok && req.value.context.lastChange).toEqual([{ trackRef: "t2", param: "tune", from: 0, to: 1 }]);
  });

  it("relative follow-ups: more → hard, too much → natural, undo → before", () => {
    const tuned = ctx({
      tracks: [{ ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false, tune: 1 }],
      lastChange: [{ trackRef: "t2", param: "tune", from: 0, to: 1 }],
    });
    expect(resolveBitekRelative("mocniej", tuned)?.proposals[0]).toMatchObject({ param: "tune", value: 2 });
    expect(resolveBitekRelative("za dużo", tuned)?.proposals[0]).toMatchObject({ param: "tune", value: 0 });
    expect(resolveBitekRelative("cofnij", tuned)?.proposals[0]).toMatchObject({ param: "tune", value: 0 });
  });

  it("apply: inserts tune after gate in the beat key, clamps hard → natural on Free, off disables", () => {
    let chain = addStudioFxToChain(emptyStudioFxChain(), "highpass", "track", id);
    chain = addStudioFxToChain(chain, "compressor", "track", id);
    const silver = bitekTuneChain({ chain, level: 2, beatKey: { keyRoot: 9, scale: 1 }, tier: "SILVER", createId: id })!;
    expect(silver.effects.map((e) => e.type)).toEqual(["highpass", "tune", "compressor"]);
    expect(silver.effects[1]!.params).toMatchObject({ keyRoot: 9, scale: 1, retuneMs: 0, amount: 1 });
    expect(bitekTuneLevelOf(silver)).toBe(2);
    const free = bitekTuneChain({ chain, level: 2, beatKey: null, tier: "FREE", createId: id })!;
    expect(bitekTuneLevelOf(free)).toBe(1);
    const off = bitekTuneChain({ chain: silver, level: 0, beatKey: null, tier: "SILVER" })!;
    expect(bitekTuneLevelOf(off)).toBe(0);
    expect(off.effects).toHaveLength(3);
  });
});
