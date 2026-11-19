import { describe, expect, it } from "vitest";

import { runBitekChatChain } from "./chain";
import { validateProposals } from "./proposals";
import { parseBitekChatRequest } from "./request";
import { scopeToNamedTarget } from "./scope";
import { bitekSpaceChain, bitekSpaceLevelOf } from "./space-apply";
import { bitekSpaceChat } from "./space-intent";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { BitekChatContext, BitekChatResult } from "./types";

const chain = (effects: StudioFxChainV1["effects"] = []): StudioFxChainV1 => ({ schemaVersion: 1, effects });
const ctx = (space: 0 | 1 | 2 | 3 = 0, step: "mix" | "master" = "mix"): BitekChatContext => ({
  lang: "pl",
  step,
  tracks: [
    { ref: "t1", name: "Bit", role: "beat", gainDb: -9, pan: 0, muted: false, hasAudio: true },
    { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 3.5, pan: 0, muted: false, hasAudio: true, tune: 0, space },
  ],
  analysis: null,
});

describe("bitekSpaceChain / bitekSpaceLevelOf", () => {
  it("an empty chain is level 0 and level 2 adds reverb + echo", () => {
    expect(bitekSpaceLevelOf(chain())).toBe(0);
    const next = bitekSpaceChain({ chain: chain(), level: 2, createId: (() => { let i = 0; return () => `id${i++}`; })() })!;
    expect(next.effects.map((e) => e.type).sort()).toEqual(["delay", "reverb"]);
    expect(bitekSpaceLevelOf(next)).toBe(2);
  });
  it("level 0 only disables reverb and echo that were on", () => {
    const on = bitekSpaceChain({ chain: chain(), level: 3, createId: () => "x" + Math.random() })!;
    const off = bitekSpaceChain({ chain: on, level: 0 })!;
    expect(off.effects.every((e) => !e.enabled)).toBe(true);
    expect(bitekSpaceLevelOf(off)).toBe(0);
    const untouched = chain();
    expect(bitekSpaceChain({ chain: untouched, level: 0 })).toBe(untouched);
  });
});

describe("bitekSpaceChat", () => {
  it("'więcej pogłosu' raises the lead vocal one level", () => {
    const r = bitekSpaceChat("dodaj więcej pogłosu na wokalu", ctx(1))!;
    expect(r.proposals).toEqual([expect.objectContaining({ trackRef: "t2", param: "space", value: 2 })]);
    expect(r.proposals[0]!.label).toContain("lekko");
  });
  it("'zrób wokal szerszy' adds space and says stereo width is untouched", () => {
    const r = bitekSpaceChat("zrób wokal szerszy", ctx(0))!;
    expect(r.proposals[0]).toMatchObject({ param: "space", value: 1 });
    expect(r.reply).toContain("Szerokości stereo");
  });
  it("'mniej echa' lowers by one, 'bez pogłosu' goes to 0", () => {
    expect(bitekSpaceChat("mniej echa", ctx(3))!.proposals[0]).toMatchObject({ value: 2 });
    expect(bitekSpaceChat("bez pogłosu na wokalu", ctx(2))!.proposals[0]).toMatchObject({ value: 0 });
  });
  it("tells the truth at the limits and ignores other targets and the master step", () => {
    expect(bitekSpaceChat("więcej pogłosu", ctx(3))!.proposals).toEqual([]);
    expect(bitekSpaceChat("bez pogłosu", ctx(0))!.reply).toContain("nie ma już pogłosu");
    expect(bitekSpaceChat("więcej pogłosu na bicie", ctx(0))).toBeNull();
    expect(bitekSpaceChat("więcej pogłosu", ctx(0, "master"))).toBeNull();
    expect(bitekSpaceChat("ściszyj bit", ctx(0))).toBeNull();
  });
  it("runs before the model: the chain answers without calling a provider", async () => {
    let called = 0;
    const r = await runBitekChatChain({
      providers: [{ id: "groq", timeoutMs: 50, complete: async () => { called += 1; return "{}"; } }],
      message: "więcej echa",
      history: [],
      context: ctx(1),
    });
    expect(called).toBe(0);
    expect(r.proposals[0]).toMatchObject({ param: "space", value: 2 });
  });
});

describe("space proposals and request", () => {
  it("validates space for vocal tracks only, with 0..3", () => {
    const ok = validateProposals([{ trackRef: "t2", param: "space", value: 3, label: "" }], ctx(1));
    expect(ok).toHaveLength(1);
    expect(validateProposals([{ trackRef: "t1", param: "space", value: 2, label: "" }], ctx(1))).toHaveLength(0);
    expect(validateProposals([{ trackRef: "t2", param: "space", value: 7, label: "" }], ctx(1))).toHaveLength(0);
    expect(validateProposals([{ trackRef: "t2", param: "space", value: 1, label: "" }], ctx(1))).toHaveLength(0);
  });
  it("keeps space on the request context and in lastChange", () => {
    const parsed = parseBitekChatRequest({
      message: "więcej",
      context: {
        step: "mix",
        tracks: [{ name: "Wokal", role: "lead_vocal", gainDb: 2, space: 2 }],
        lastChange: [{ trackRef: "t1", param: "space", from: 1, to: 2 }],
      },
    });
    expect(parsed.ok && parsed.value.context.tracks[0]!.space).toBe(2);
    expect(parsed.ok && parsed.value.context.lastChange).toEqual([{ trackRef: "t1", param: "space", from: 1, to: 2 }]);
  });
});

describe("scopeToNamedTarget", () => {
  const model = (): BitekChatResult => ({
    provider: "groq",
    reply: "Podgłośnię wokal i ściszę bit.",
    proposals: [
      { trackRef: "t2", param: "gainDb", value: 5.5, label: "" },
      { trackRef: "t1", param: "gainDb", value: -11.5, label: "" },
    ],
  });
  it("'ściszyj bit' drops the unasked vocal change", () => {
    const out = scopeToNamedTarget(model(), "ściszyj bit", ctx());
    expect(out.dropped).toBe(true);
    expect(out.result.proposals.map((p) => p.trackRef)).toEqual(["t1"]);
  });
  it("names both or neither target: nothing is dropped", () => {
    expect(scopeToNamedTarget(model(), "ściszyj bit i podgłośnij wokal", ctx()).dropped).toBe(false);
    expect(scopeToNamedTarget(model(), "popraw miks", ctx()).dropped).toBe(false);
  });
  it("the chain answers 'ściszyj bit' from the rules, not from the model's extra vocal change", async () => {
    const r = await runBitekChatChain({
      providers: [{ id: "groq", timeoutMs: 50, complete: async () => JSON.stringify({ reply: "Podgłośnię wokal i ściszę bit.", proposals: [{ trackRef: "t2", param: "gainDb", value: 5.5 }, { trackRef: "t1", param: "gainDb", value: -11.5 }], jobs: [] }) }],
      message: "ściszyj bit",
      history: [],
      context: ctx(),
    });
    expect(r.proposals.every((p) => p.trackRef === "t1")).toBe(true);
    expect(r.reply).not.toContain("Podgłośnię wokal");
  });
});
