import { describe, expect, it } from "vitest";

import { runBitekChatChain } from "./chain";
import { bitekMasterRulesChat, classifyMasterRequest } from "./master-intents";
import { buildBitekSystemPrompt } from "./prompt";
import { parseBitekModelOutput, validateProposals } from "./proposals";
import { parseBitekChatRequest } from "./request";
import type { BitekChatContext } from "./types";

const ctx = (lang: "pl" | "en" = "pl"): BitekChatContext => ({
  lang,
  step: "master",
  tracks: [{ ref: "t1", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false }],
  analysis: null,
  master: { target: "streaming", settings: { loudness: 0, bright: 0, bass: 0, width: 0, squash: 0 }, cards: [{ id: "tonal", status: "yellow", value: null }] },
});

describe("BITEK in Mastering — scope", () => {
  it.each([
    ["głośniej wokal", "track"],
    ["mniej pogłosu na adlibach", "track"],
    ["ścisz bit", "track"],
    ["louder vocal", "track"],
    ["rozrzuć adliby na boki", "track"],
    ["głośniej całość", "whole"],
    ["jaśniej", "whole"],
    ["więcej basu w całości", "whole"],
    ["szerzej", "whole"],
    ["mniej ściśnięte", "whole"],
    ["make the whole song brighter", "whole"],
    ["jak brzmi?", "other"],
  ])("%s → %s", (msg, kind) => {
    expect(classifyMasterRequest(msg).kind).toBe(kind);
  });

  it("whole-track ask → master setting proposal in 1st person", () => {
    const r = bitekMasterRulesChat("więcej basu w całości", ctx());
    expect(r.proposals).toEqual([{ trackRef: "master", param: "bass", value: 1, label: "Całość: bas 0 → +1" }]);
    expect(r.reply).toMatch(/^Dołożę/);
    const q = bitekMasterRulesChat("mniej ściśnięte", ctx());
    expect(q.proposals[0]).toMatchObject({ param: "squash", value: -1 });
    const l = bitekMasterRulesChat("głośniej całość", ctx());
    expect(l.reply).toContain("-13 LUFS");
  });

  it("single-track ask → refuses in 1st person, offers Back to Mix, says master must be redone", () => {
    const r = bitekMasterRulesChat("głośniej wokal", ctx());
    expect(r.backToMix).toBe(true);
    expect(r.proposals).toEqual([]);
    expect(r.reply).toMatch(/nie zrobię/);
    expect(r.reply).toMatch(/Mixu/);
    expect(r.reply).toMatch(/mastering jeszcze raz/);
    expect(bitekMasterRulesChat("louder vocal", ctx("en")).reply).toMatch(/back to Mix/);
  });

  it("at the end of the range there is no proposal", () => {
    const c = ctx();
    c.master!.settings.width = 3;
    expect(bitekMasterRulesChat("szerzej", c).proposals).toEqual([]);
  });

  it("chain answers scope asks without calling the model; other asks still go to the model", async () => {
    let calls = 0;
    const provider = { id: "groq" as const, timeoutMs: 1000, complete: async () => (calls++, '{"reply":"Brzmi dobrze, numer jest gotowy na Spotify.","proposals":[{"trackRef":"t1","param":"gainDb","value":3},{"trackRef":"master","param":"bright","value":1}],"backToMix":false}') };
    const a = await runBitekChatChain({ providers: [provider], message: "głośniej wokal", history: [], context: ctx() });
    expect(a.backToMix).toBe(true);
    expect(calls).toBe(0);
    const b = await runBitekChatChain({ providers: [provider], message: "jak brzmi?", history: [], context: ctx() });
    expect(calls).toBe(1);
    // per-track proposal dropped in Mastering, master proposal kept
    expect(b.proposals.map((p) => p.param)).toEqual(["bright"]);
  });

  it("validation: master proposals only in master step; track proposals never in master", () => {
    expect(validateProposals([{ trackRef: "master", param: "bright", value: 9 }], ctx())[0].value).toBe(3);
    expect(validateProposals([{ trackRef: "t1", param: "gainDb", value: 3 }], ctx())).toEqual([]);
    const mix = { ...ctx(), step: "mix" as const, master: null };
    expect(validateProposals([{ trackRef: "master", param: "bright", value: 1 }], mix)).toEqual([]);
    expect(parseBitekModelOutput('{"reply":"x","proposals":[],"backToMix":true}', mix)).toEqual({ reply: "x", proposals: [] });
  });

  it("request parser keeps master context; prompt carries the mastering rule", () => {
    const p = parseBitekChatRequest({ message: "hej", context: { step: "master", master: { target: "club", settings: { bass: 7, bright: "1" }, cards: [] } } });
    expect(p.ok && p.value.context.master).toEqual({ target: "club", settings: { loudness: 0, bright: 0, bass: 3, width: 0, squash: 0 }, cards: [] });
    expect(buildBitekSystemPrompt(ctx())).toContain('"backToMix": true');
  });
});

describe("BITEK in Mastering — provider chain", () => {
  const llm = { id: "groq" as const, timeoutMs: 50, complete: async () => JSON.stringify({ reply: "Dodam trochę jasności całości.", proposals: [{ trackRef: "master", param: "bright", value: 1 }] }) };
  it("whole-song asks go through the LLM chain", async () => {
    const r = await runBitekChatChain({ providers: [llm], message: "jaśniej całość", history: [], context: ctx() });
    expect(r.provider).toBe("groq");
  });
  it("single-track asks stay deterministic (back to Mix) before the LLM", async () => {
    const r = await runBitekChatChain({ providers: [llm], message: "głośniej wokal", history: [], context: ctx() });
    expect(r.provider).toBe("rules");
    expect(r.backToMix).toBe(true);
  });
  it("falls back to master rules when no provider answers", async () => {
    const r = await runBitekChatChain({ providers: [], message: "jaśniej", history: [], context: ctx() });
    expect(r.provider).toBe("rules");
    expect(r.proposals.length).toBe(1);
  });
});
