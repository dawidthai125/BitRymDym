import { describe, expect, it } from "vitest";

import { summarizeChainChange, summarizeMixChanges } from "./mix-change-summary";

const names = { v: "Wokal", b: "Bit" };

describe("summarizeMixChanges", () => {
  it("levels, pan, mute and solo read as plain Polish", () => {
    expect(
      summarizeMixChanges(
        [
          { path: "tracks.v.gainDb", before: 3.5, after: 5.5 },
          { path: "tracks.b.gainDb", before: 0, after: -9.9 },
          { path: "tracks.v.pan", before: 0, after: -0.3 },
          { path: "tracks.b.muted", before: false, after: true },
          { path: "tracks.v.solo", before: false, after: true },
          { path: "project.masterGainDb", before: 0, after: -6.2 },
        ],
        names,
      ),
    ).toEqual([
      "Wokal: głośność +3,5 → +5,5 dB (+2)",
      "Bit: głośność 0 → -9,9 dB (-9,9)",
      "Wokal: panorama środek → L30",
      "Bit: wyciszony",
      "Wokal: solo włączone",
      "Master: głośność 0 → -6,2 dB",
    ]);
  });

  it("an unknown track id stays generic and never leaks the id", () => {
    const out = summarizeMixChanges([{ path: "tracks.zzz.gainDb", before: 0, after: 1 }], names);
    expect(out[0]).toBe("Ścieżka: głośność 0 → +1 dB (+1)");
    expect(out[0]).not.toContain("zzz");
  });
});

describe("summarizeChainChange", () => {
  const eff = (type: string, params: Record<string, unknown>, enabled = true, id = type) => ({ id, type, enabled, params });
  it("added, removed, switched and tuned effects", () => {
    expect(summarizeChainChange({ effects: [] }, { effects: [eff("reverb", { mix: 0.22, decaySeconds: 1.6 })] }, "Wokal")).toEqual([
      "Wokal: dodano efekt Pogłos (ilość 22%)",
    ]);
    expect(summarizeChainChange({ effects: [eff("reverb", { mix: 0.22 })] }, { effects: [] }, "Wokal")).toEqual(["Wokal: usunięto efekt Pogłos"]);
    expect(summarizeChainChange({ effects: [eff("delay", { mix: 0.1 }, true)] }, { effects: [eff("delay", { mix: 0.1 }, false)] }, "Wokal")).toEqual([
      "Wokal: efekt Echo wyłączony",
    ]);
    expect(summarizeChainChange({ effects: [eff("compressor", { ratio: 2, thresholdDb: -18 })] }, { effects: [eff("compressor", { ratio: 3, thresholdDb: -18 })] }, "Wokal")).toEqual([
      "Wokal: Kompresor: kompresja 2 → 3",
    ]);
  });
  it("nested EQ bands and a cap on listed parameters", () => {
    const out = summarizeChainChange(
      { effects: [eff("eq", { mid: { gainDb: 0, frequencyHz: 1000 } })] },
      { effects: [eff("eq", { mid: { gainDb: 2, frequencyHz: 1200 } })] },
      "Wokal",
    );
    expect(out[0]).toContain("EQ:");
    expect(out[0]).toContain("środek · wzmocnienie (dB) 0 → 2");
  });
});
