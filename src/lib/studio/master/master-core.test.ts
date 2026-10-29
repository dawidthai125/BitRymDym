import { describe, expect, it } from "vitest";

import { lufsOf, masterPreview, measureMaster, truePeakDbOf, type Stereo } from "./dsp";
import { renderMixStereo } from "./render-mix";
import { clampMasterSettings, DEFAULT_MASTER_SETTINGS, MASTER_TARGET_IDS, MASTER_TARGETS, masterGoal } from "./targets";
import { buildMasterVerdict } from "./verdict";

const SR = 32000;
function synth(seconds = 8, level = 0.2, seed = 1): Stereo {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const n = SR * seconds;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const kick = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-(t % 0.5) * 12);
    const voc = 0.5 * Math.sin(2 * Math.PI * 220 * t + 2 * Math.sin(2 * Math.PI * 3 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t));
    const hat = rnd() * 0.15 * Math.exp(-(t % 0.25) * 40);
    left[i] = kick + voc + hat;
    right[i] = kick + 0.9 * voc + hat * 0.7;
    max = Math.max(max, Math.abs(left[i]), Math.abs(right[i]));
  }
  for (let i = 0; i < n; i++) { left[i] *= level / max; right[i] *= level / max; }
  return { left, right, sampleRate: SR };
}

describe("mastering preview (browser, approximate)", () => {
  it.each(MASTER_TARGET_IDS)("hits %s LUFS ±0.5 and TP ≤ target", (target) => {
    const out = masterPreview(synth(), target, DEFAULT_MASTER_SETTINGS);
    expect(Math.abs(lufsOf(out) - MASTER_TARGETS[target].lufs)).toBeLessThanOrEqual(0.5);
    expect(truePeakDbOf(out)).toBeLessThanOrEqual(MASTER_TARGETS[target].tp + 1e-6);
  });

  it("loudness offset moves the goal; settings are clamped", () => {
    const s = clampMasterSettings({ loudness: 2, bright: 99, bass: "x", width: -10 });
    expect(s).toEqual({ loudness: 2, bright: 3, bass: 0, width: -3, squash: 0 });
    const out = masterPreview(synth(8, 0.2, 3), "streaming", s);
    expect(Math.abs(lufsOf(out) - masterGoal("streaming", s).lufs)).toBeLessThanOrEqual(0.5);
  });

  it("width and brightness move the measured stereo / tonal numbers", () => {
    const x = synth(6, 0.2, 5);
    const wide = measureMaster(masterPreview(x, "streaming", { ...DEFAULT_MASTER_SETTINGS, width: 3 }));
    const narrow = measureMaster(masterPreview(x, "streaming", { ...DEFAULT_MASTER_SETTINGS, width: -3 }));
    expect(wide.sideToMid).toBeGreaterThan(narrow.sideToMid);
    const bright = measureMaster(masterPreview(x, "streaming", { ...DEFAULT_MASTER_SETTINGS, bright: 3 }));
    const dark = measureMaster(masterPreview(x, "streaming", { ...DEFAULT_MASTER_SETTINGS, bright: -3 }));
    expect(bright.tonal.high.db).toBeGreaterThan(dark.tonal.high.db);
  });

  it("verdict: on-target master has green loudness + true peak; quiet mix is flagged", () => {
    const mastered = measureMaster(masterPreview(synth(), "streaming", DEFAULT_MASTER_SETTINGS));
    const v = buildMasterVerdict(mastered, "streaming", DEFAULT_MASTER_SETTINGS);
    expect(v.cards.find((c) => c.id === "loudness")?.status).toBe("green");
    expect(v.cards.find((c) => c.id === "truePeak")?.status).toBe("green");
    const raw = buildMasterVerdict(measureMaster(synth(8, 0.05)), "streaming", DEFAULT_MASTER_SETTINGS);
    expect(raw.cards.find((c) => c.id === "loudness")?.messageKey).toBe("quiet");
    expect(v.cards.map((c) => c.id)).toEqual(["loudness", "truePeak", "dynamics", "tonal", "lowEnd", "stereo"]);
  });
});

describe("renderMixStereo", () => {
  const src = synth(2, 0.5);
  const input = {
    sampleRate: SR,
    lengthMs: 2000,
    masterGainDb: -6,
    masterPan: 0,
    tracks: [
      { id: "a", name: "Bit", role: "beat" as const, gainDb: -12, pan: 0, muted: false, solo: false },
      { id: "b", name: "Wokal", role: "lead_vocal" as const, gainDb: 6, pan: 0.5, muted: false, solo: false },
    ],
    clips: ["a", "b"].map((trackId) => ({ trackId, sourceKey: "s", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 2000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 })),
    sources: { s: { channels: [src.left, src.right] } },
  };
  it("mix applies gains/master gain; raw ignores them and peaks at -1 dBFS", () => {
    const mix = renderMixStereo(input);
    const raw = renderMixStereo(input, { raw: true });
    let peak = 0;
    for (let i = 0; i < raw.left.length; i++) peak = Math.max(peak, Math.abs(raw.left[i]), Math.abs(raw.right[i]));
    expect(20 * Math.log10(peak)).toBeCloseTo(-1, 1);
    expect(lufsOf(mix)).not.toBeCloseTo(lufsOf(raw), 0);
  });
});
