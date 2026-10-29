import { describe, expect, it } from "vitest";

import { bitekRulesGuide, type BitekState } from "@/lib/studio/bitek/bitek-guide";
import type { MixVerdict } from "@/lib/studio/mix-analysis/verdict";

import pl from "../../../../messages/pl.json";
import en from "../../../../messages/en.json";

const base: BitekState = {
  step: "record",
  hasBeat: true,
  vocalTrackCount: 1,
  vocalClipCount: 1,
  recording: false,
  analysis: { status: "idle" },
};

const verdict = (statuses: Record<string, "green" | "yellow" | "red">): MixVerdict => {
  const cards = Object.entries(statuses).map(([id, status]) => ({ id, status, messageKey: "ok", params: {}, value: null })) as MixVerdict["cards"];
  const redCount = cards.filter((c) => c.status === "red").length;
  return { overall: redCount ? "red" : "green", cards, redCount, yellowCount: cards.filter((c) => c.status === "yellow").length, canMaster: redCount === 0 };
};

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
}

describe("Stage 1 — BITEK rule-based guide", () => {
  it("record step: no beat → choose beat; no vocal → record; ready → go to Mix", () => {
    expect(bitekRulesGuide({ ...base, hasBeat: false })[0].action).toBe("chooseBeat");
    expect(bitekRulesGuide({ ...base, vocalClipCount: 0 })[0].action).toBe("record");
    expect(bitekRulesGuide(base)[0]).toMatchObject({ key: "readyForMix", action: "goMix" });
  });

  it("while recording stays quiet with one info message", () => {
    expect(bitekRulesGuide({ ...base, recording: true })).toHaveLength(1);
  });

  it("mix step walks idle → running → red fixes → green master hint", () => {
    const mix = { ...base, step: "mix" as const };
    expect(bitekRulesGuide(mix)[0].action).toBe("analyze");
    expect(bitekRulesGuide({ ...mix, analysis: { status: "running", progress: 0.42 } })[0].params?.pct).toBe(42);
    const red = bitekRulesGuide({ ...mix, analysis: { status: "done", stale: false, verdict: verdict({ balance: "red", clipping: "red", noise: "yellow" }) } });
    expect(red.map((m) => m.key)).toEqual(["mixHasRed", "fix.clipping", "fix.balance", "mixRecheck"]);
    const green = bitekRulesGuide({ ...mix, analysis: { status: "done", stale: false, verdict: verdict({ balance: "green" }) } });
    expect(green.map((m) => m.key)).toEqual(["mixAllGreen", "mixReadyForMaster"]);
  });

  it("every message key exists in PL and EN", () => {
    const keys = new Set<string>(["recording", "chooseBeat", "recordVocal", "readyForMix", "mixNeedsVocal", "mixIntro", "mixRunning", "mixFailed", "mixStale", "mixHasRed", "mixRecheck", "mixHasYellow", "mixAllGreen", "mixReadyForMaster"]);
    for (const id of ["clipping", "balance", "presence", "masking", "noise", "sibilance", "stereo", "panorama", "loudness"]) keys.add(`fix.${id}`);
    for (const k of keys) {
      expect(typeof lookup(pl, `studio.bitek.msg.${k}`), `pl ${k}`).toBe("string");
      expect(typeof lookup(en, `studio.bitek.msg.${k}`), `en ${k}`).toBe("string");
    }
  });
});
