import { describe, expect, it, vi } from "vitest";

import { runBitekChatChain } from "./chain";
import { buildBitekSystemPrompt } from "./prompt";
import { parseBitekModelOutput, pickBitekWhy } from "./proposals";
import { classifyBitekRelative, nextRelativeValue, resolveBitekRelative } from "./relative";
import { parseBitekChatRequest } from "./request";
import type { BitekChatContext } from "./types";

// State AFTER the user applied "vocal 0 → +2 dB".
const ctx: BitekChatContext = {
  lang: "pl",
  step: "mix",
  tracks: [
    { ref: "t1", name: "Bit", role: "beat", gainDb: -3, pan: 0, muted: false },
    { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 2, pan: 0, muted: false },
    { ref: "t3", name: "Adlib", role: "adlib", gainDb: -6, pan: -0.5, muted: false },
  ],
  analysis: null,
  lastChange: [{ trackRef: "t2", param: "gainDb", from: 0, to: 2 }],
};

describe("classifyBitekRelative", () => {
  it.each([
    ["więcej", "more"],
    ["jeszcze trochę", "bit_more"],
    ["trochę mniej", "less"],
    ["za dużo", "less"],
    ["przesadziłeś", "less"],
    ["za mało", "too_little"],
    ["cofnij to", "undo"],
    ["more", "more"],
    ["a bit more", "bit_more"],
    ["too much", "less"],
    ["undo", "undo"],
  ])("%s → %s", (msg, kind) => {
    expect(classifyBitekRelative(msg)?.kind).toBe(kind);
  });
  it("ignores long or non-relative messages", () => {
    expect(classifyBitekRelative("jak mam ustawić pogłos na adlibach w refrenie żeby było więcej przestrzeni i klimatu")).toBeNull();
    expect(classifyBitekRelative("głośniej wokal")).toBeNull();
  });
});

describe("resolveBitekRelative (mix)", () => {
  it("więcej → repeats the delta from the current value, with a first-person why", () => {
    const r = resolveBitekRelative("więcej", ctx)!;
    expect(r.relative).toBe("more");
    expect(r.proposals).toEqual([
      expect.objectContaining({ trackRef: "t2", param: "gainDb", value: 4, label: "Wokal: +2 → +4 dB (+2)" }),
    ]);
    expect(r.proposals[0].why).toMatch(/^Idę dalej/);
  });
  it("za dużo → pulls back half", () => {
    expect(resolveBitekRelative("za dużo", ctx)!.proposals[0].value).toBe(1);
  });
  it("trochę ciszej after a boost → half back down", () => {
    expect(resolveBitekRelative("trochę ciszej", ctx)!.proposals[0].value).toBe(1);
  });
  it("jeszcze głośniej → same direction", () => {
    expect(resolveBitekRelative("jeszcze głośniej", ctx)!.proposals[0].value).toBe(4);
  });
  it("cofnij → back to from", () => {
    const r = resolveBitekRelative("cofnij", ctx)!;
    expect(r.proposals[0]).toMatchObject({ value: 0 });
    expect(r.reply).toMatch(/wracam/i);
  });
  it("respects the gain limit and says so", () => {
    const top: BitekChatContext = {
      ...ctx,
      tracks: ctx.tracks.map((t) => (t.ref === "t2" ? { ...t, gainDb: 12 } : t)),
      lastChange: [{ trackRef: "t2", param: "gainDb", from: 10, to: 12 }],
    };
    const r = resolveBitekRelative("więcej", top)!;
    expect(r.proposals).toEqual([]);
    expect(r.reply).toMatch(/granica/);
  });
  it("pan follow-up and mute undo", () => {
    const pan = { ...ctx, lastChange: [{ trackRef: "t3", param: "pan" as const, from: 0, to: -0.5 }] };
    expect(resolveBitekRelative("mniej", pan)!.proposals[0].value).toBe(-0.25);
    const mute = {
      ...ctx,
      tracks: ctx.tracks.map((t) => (t.ref === "t1" ? { ...t, muted: true } : t)),
      lastChange: [{ trackRef: "t1", param: "muted" as const, from: false, to: true }],
    };
    expect(resolveBitekRelative("cofnij", mute)!.proposals[0]).toMatchObject({ param: "muted", value: false });
    expect(resolveBitekRelative("więcej", mute)).toBeNull();
  });
  it("naming another target is not a follow-up; no last change → null", () => {
    expect(resolveBitekRelative("więcej bitu", ctx)).toBeNull();
    expect(resolveBitekRelative("więcej wokalu", ctx)).not.toBeNull();
    expect(resolveBitekRelative("więcej", { ...ctx, lastChange: null })).toBeNull();
  });
  it("EN", () => {
    const r = resolveBitekRelative("too much", { ...ctx, lang: "en" })!;
    expect(r.reply).toMatch(/overdid/);
    expect(r.proposals[0].why).toMatch(/^I'm pulling back/);
  });
});

describe("resolveBitekRelative (master)", () => {
  const master: BitekChatContext = {
    lang: "pl",
    step: "master",
    tracks: [],
    analysis: null,
    master: { target: "streaming", settings: { loudness: 1, bright: 0, bass: 0, width: 0, squash: 0 }, cards: [] },
    lastChange: [{ trackRef: "master", param: "loudness", from: 0, to: 1 }],
  };
  it("więcej on a master setting", () => {
    expect(resolveBitekRelative("więcej", master)!.proposals[0]).toMatchObject({ trackRef: "master", param: "loudness", value: 2 });
    expect(resolveBitekRelative("za dużo", master)!.proposals[0].value).toBe(0.5);
  });
});

describe("nextRelativeValue", () => {
  it("always moves at least one step", () => {
    expect(nextRelativeValue({ kind: "less", direction: 0, param: "gainDb", current: 0.5, from: 0, to: 0.5 })).toBe(0);
    expect(nextRelativeValue({ kind: "bit_more", direction: 0, param: "pan", current: 0.1, from: 0, to: 0.05 })).toBe(0.15);
  });
});

describe("why from the model", () => {
  it("keeps one sentence, clips, falls back to a server template", () => {
    expect(pickBitekWhy("Podgłaśniam wokal, żeby był wyraźny. A potem coś jeszcze.", "pl")).toBe("Podgłaśniam wokal, żeby był wyraźny.");
    expect(pickBitekWhy("x", "pl")).toBeNull();
    expect(pickBitekWhy(`${"słowo ".repeat(60)}`, "pl")!.length).toBeLessThanOrEqual(160);
    const out = parseBitekModelOutput(
      JSON.stringify({ reply: "Podgłośnię wokal.", proposals: [{ trackRef: "t2", param: "gainDb", value: 3 }] }),
      ctx,
    );
    expect(out!.proposals[0].why).toBe("Podgłaśniam Wokal, żeby lepiej przebijał się przez resztę.");
    const en = parseBitekModelOutput(
      JSON.stringify({ reply: "I'll push it.", proposals: [{ trackRef: "t2", param: "gainDb", value: 3, why: "Ściszam bit bo tak jest lepiej i już." }] }),
      { ...ctx, lang: "en" },
    );
    expect(en!.proposals[0].why).toMatch(/^I'm turning Wokal up/);
  });
});

describe("chain + request + prompt", () => {
  it("relative follow-ups never hit the LLM", async () => {
    const complete = vi.fn(async () => "{}");
    const r = await runBitekChatChain({
      providers: [{ id: "groq", timeoutMs: 50, complete }],
      message: "jeszcze",
      history: [],
      context: ctx,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(r.proposals[0].value).toBe(4);
  });
  it("request validates lastChange against the context", () => {
    const parsed = parseBitekChatRequest({
      message: "więcej",
      context: {
        step: "mix",
        tracks: [{ name: "Wokal", role: "lead_vocal", gainDb: 2 }],
        lastChange: [
          { trackRef: "t1", param: "gainDb", from: 0, to: 99 },
          { trackRef: "t9", param: "gainDb", from: 0, to: 2 },
          { trackRef: "t1", param: "muted", from: "no", to: true },
        ],
      },
    });
    expect(parsed.ok && parsed.value.context.lastChange).toEqual([{ trackRef: "t1", param: "gainDb", from: 0, to: 12 }]);
  });
  it("prompt carries last_change and the why rule", () => {
    const p = buildBitekSystemPrompt(ctx);
    expect(p).toContain('"last_change":[{"trackRef":"t2","param":"gainDb","from":0,"to":2}]');
    expect(p).toContain('"why"');
    expect(buildBitekSystemPrompt(ctx, { compact: true })).toContain("last_change");
  });
});
