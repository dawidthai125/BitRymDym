import { describe, expect, it } from "vitest";

import { buildBitekClientContext } from "./client-context";
import { runBitekChatChain } from "./chain";
import { groundBitekResult } from "./ground";
import { bitekRulesChat } from "./intents";
import { buildBitekSystemPrompt } from "./prompt";
import { validateProposals } from "./proposals";
import { bitekRecordHelper } from "./record-helper";
import { parseBitekChatRequest } from "./request";
import { gainDbForTakePeak, takeIssueFromPeak } from "../record-handoff";
import type { BitekChatContext } from "./types";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

const beatOnly = (): BitekChatContext => ({
  lang: "pl",
  step: "mix",
  tracks: [{ ref: "t1", name: "Bit", role: "beat", gainDb: 0, pan: 0, muted: false, hasAudio: true, clipCount: 1, durationMs: 8000 }],
  analysis: null,
});

describe("BITEK grounding", () => {
  it("context builder lists real tracks and whether they have audio", () => {
    const doc = {
      project: { id: "p" },
      tracks: [
        { id: "beat", name: "Bit", trackRole: "beat", gainDb: -3, pan: 0, muted: false, solo: false, effectsChain: { schemaVersion: 1, effects: [] } },
        {
          id: "vox",
          name: "Wokal",
          trackRole: "lead_vocal",
          gainDb: 0,
          pan: 0,
          muted: true,
          solo: false,
          effectsChain: { schemaVersion: 1, effects: [{ id: "e", type: "compressor", enabled: true, params: {} }] },
        },
      ],
      clips: [{ id: "c1", trackId: "beat", durationMs: 4000 }],
    } as unknown as StudioProjectDocument;
    const built = buildBitekClientContext({ doc, lang: "pl", step: "mix" });
    expect(built.trackIdByRef).toEqual({ t1: "beat", t2: "vox" });
    expect(built.context.tracks.map((t) => ({ ref: t.ref, role: t.role, hasAudio: t.hasAudio, clipCount: t.clipCount }))).toEqual([
      { ref: "t1", role: "beat", hasAudio: true, clipCount: 1 },
      { ref: "t2", role: "lead_vocal", hasAudio: false, clipCount: 0 },
    ]);
    expect(built.context.tracks[1]?.effects).toEqual(["compressor"]);
    expect(built.context.tracks[1]?.muted).toBe(true);
  });

  it("rejects a gain change on a missing track and on a track with no audio", () => {
    const ctx = beatOnly();
    expect(validateProposals([{ trackRef: "t9", param: "gainDb", value: 2 }], ctx)).toEqual([]);
    expect(validateProposals([{ trackRef: "t2", param: "gainDb", value: 2 }], ctx)).toEqual([]);
    const emptyVocal: BitekChatContext = {
      ...ctx,
      tracks: [...ctx.tracks, { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false, hasAudio: false }],
    };
    expect(validateProposals([{ trackRef: "t2", param: "gainDb", value: 2 }], emptyVocal)).toEqual([]);
    expect(bitekRulesChat("podgłośnij wokal", emptyVocal).proposals).toEqual([]);
    expect(bitekRulesChat("podgłośnij wokal", emptyVocal).reply).toMatch(/pusta/);
  });

  it("prompt carries the inventory and forbids inventing tracks", () => {
    const p = buildBitekSystemPrompt(beatOnly());
    expect(p).toContain("Nie wymyślaj ścieżek");
    expect(p).toContain("INWENTARZ");
    expect(p).toContain('"hasAudio":true');
    expect(p).toContain("ETAP mix");
    expect(p).not.toContain("Podgłośnię go o 3 dB");
    const en = buildBitekSystemPrompt({ ...beatOnly(), lang: "en", step: "record" });
    expect(en).toContain("Never invent tracks");
    expect(en).toContain("INVENTORY");
    expect(en).toContain("STAGE record");
  });

  it("replaces a reply that boosts a vocal the project does not have", () => {
    const grounded = groundBitekResult(
      {
        provider: "groq",
        reply: "Podgłośnię wokal o 2 dB, żeby wyszedł przed bit.",
        proposals: [{ trackRef: "t1", param: "gainDb", value: 2, label: "Bit: 0 → +2 dB (+2)" }],
      },
      beatOnly(),
    );
    expect(grounded.proposals).toEqual([]);
    expect(grounded.reply).toMatch(/Nie widzę jeszcze ścieżki wokalu/);
  });

  it("recording helper never returns mix actions", () => {
    const ctx: BitekChatContext = { ...beatOnly(), step: "record", takeLevel: { peakDb: -28, clipping: false } };
    const r = bitekRecordHelper("podgłośnij wokal", ctx);
    expect(r.proposals).toEqual([]);
    expect(r.jobs).toBeUndefined();
    expect(r.reply).toMatch(/nie ruszam suwaków/);
    expect(r.reply).toMatch(/-28/);
  });

  it("chain on record does not call the model", async () => {
    let calls = 0;
    const r = await runBitekChatChain({
      providers: [{ id: "groq", timeoutMs: 50, complete: async () => (calls++, '{"reply":"Podgłośnię wokal","proposals":[{"trackRef":"t1","param":"gainDb","value":3}]}') }],
      message: "głośniej wokal",
      history: [],
      context: { ...beatOnly(), step: "record" },
    });
    expect(calls).toBe(0);
    expect(r.proposals).toEqual([]);
  });

  it("request parser keeps hasAudio and drops unknown effects", () => {
    const req = parseBitekChatRequest({
      message: "hej",
      context: {
        lang: "pl",
        step: "mix",
        tracks: [{ name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, hasAudio: false, effects: ["compressor", "explode"], durationMs: 0 }],
      },
    });
    expect(req.ok && req.value.context.tracks[0]).toMatchObject({ ref: "t1", hasAudio: false, effects: ["compressor"], durationMs: 0 });
  });
});

describe("take peak → gain", () => {
  it("classifies quiet and clip, and clamps the fader move to 6 dB", () => {
    expect(takeIssueFromPeak(-28)).toBe("quiet");
    expect(takeIssueFromPeak(-12)).toBeNull();
    expect(takeIssueFromPeak(-0.2)).toBe("clip");
    expect(gainDbForTakePeak(0, "quiet", -30)).toBe(6);
    expect(gainDbForTakePeak(0, "clip", 0)).toBe(-6);
    expect(gainDbForTakePeak(0, "quiet", -12.2)).toBeNull();
  });
});
