import { describe, expect, it } from "vitest";

import { bitekRulesChat } from "./intents";
import { bitekMasterClarityChat } from "./master-intents";
import { planMasterClarity } from "./master-clarity";
import { bitekRecordHelper } from "./record-helper";
import type { BitekChatContext, BitekMasterSetting } from "./types";

const settings = (): Record<BitekMasterSetting, number> => ({ loudness: 0, bright: 0, bass: 0, width: 0, squash: 0 });

describe("measured master tone", () => {
  it("cuts a harsh top by the shelf size and leaves a clean song alone", () => {
    const harsh = planMasterClarity({
      settings: settings(),
      cards: [{ id: "tonal", status: "yellow", value: "+6.2 dB", note: "harsh:high" }],
      measuredLufs: -14,
      truePeakDb: -1.2,
      target: "streaming",
      lang: "pl",
      targetName: "streamingu",
    });
    expect(harsh.moves).toEqual([{ key: "bright", value: -2, reason: "harsh" }]);
    expect(harsh.mixBand).toBeNull();

    const clean = planMasterClarity({
      settings: settings(),
      cards: [{ id: "tonal", status: "green", value: "+1.0 dB", note: "ok" }],
      measuredLufs: -14,
      truePeakDb: -1.2,
      target: "streaming",
      lang: "pl",
      targetName: "streamingu",
    });
    expect(clean.moves).toEqual([]);
  });

  it("sends middle mud back to the mix and pulls a boomy low end", () => {
    const plan = planMasterClarity({
      settings: settings(),
      cards: [
        { id: "tonal", status: "red", value: "+8.0 dB", note: "muddy:mid" },
        { id: "lowEnd", status: "red", value: "+8.0 dB", note: "boomy" },
      ],
      measuredLufs: -14,
      truePeakDb: -1,
      target: "streaming",
      lang: "en",
      targetName: "streaming",
    });
    expect(plan.mixBand).toBe("muddy");
    expect(plan.moves).toEqual([{ key: "bass", value: -3, reason: "boomy" }]);
  });
});

const masterCtx = (): BitekChatContext => ({
  lang: "pl",
  step: "master",
  tracks: [],
  analysis: { overall: "yellow", stale: false, cards: [], masterIntegratedLufs: -14, masterTruePeakDbtp: -1.2 },
  master: {
    target: "streaming",
    settings: settings(),
    cards: [{ id: "tonal", status: "yellow", value: "+6.2 dB", note: "harsh:high" }],
  },
});

describe("BITEK applies tone only when asked", () => {
  it("offers one master patch for a clarity ask and stays quiet otherwise", () => {
    const asked = bitekMasterClarityChat("popraw brzmienie i czystość", masterCtx());
    expect(asked?.jobs?.[0]).toMatchObject({ kind: "masterClarity", patch: { bright: -2 } });
    expect(asked?.reply).toMatch(/Zastosuj/);
    expect(bitekMasterClarityChat("jak brzmi?", masterCtx())).toBeNull();
    expect(bitekMasterClarityChat("czyściej wokal", masterCtx())).toBeNull();
  });

  it("fixes only the weak mix cards", () => {
    const ctx: BitekChatContext = {
      lang: "pl",
      step: "mix",
      tracks: [
        { ref: "t1", name: "Bit", role: "beat", gainDb: 0, pan: 0, muted: false, hasAudio: true },
        { ref: "t2", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false, hasAudio: true },
      ],
      analysis: {
        overall: "yellow",
        stale: false,
        cards: [
          { id: "sibilance", status: "red", value: null },
          { id: "stereo", status: "yellow", value: null },
          { id: "presence", status: "green", value: null },
        ],
        masterIntegratedLufs: null,
        masterTruePeakDbtp: null,
      },
    };
    const job = bitekRulesChat("popraw brzmienie i czystość", ctx).jobs?.[0];
    expect(job).toMatchObject({ kind: "mixFix", fixes: ["deesser"] });
    expect(bitekRulesChat("popraw brzmienie", { ...ctx, analysis: { ...ctx.analysis!, cards: [] } }).reply).toMatch(/Nic nie ruszam/);
  });

  it("does not touch faders while recording", () => {
    const reply = bitekRecordHelper("popraw czystość", {
      lang: "pl",
      step: "record",
      tracks: [],
      analysis: null,
    });
    expect(reply.proposals).toEqual([]);
    expect(reply.reply).toMatch(/mixu/);
  });
});
