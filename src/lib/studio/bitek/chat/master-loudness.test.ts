import { describe, expect, it } from "vitest";

import { planMasterLoudnessStep, resolveMasterLoudness } from "./master-loudness";

const streaming = {
  targetLufs: -14,
  ceilingDb: -1,
  currentOffset: 0,
  lang: "pl" as const,
  targetName: "streamingu",
};

describe("master loudness step", () => {
  it("full step within limits: −18 → −14 is +4, not clamped to +3", () => {
    const plan = planMasterLoudnessStep({
      measuredLufs: -18,
      targetLufs: -14,
      truePeakDb: -12,
      ceilingDb: -1,
    });
    expect(plan.ideal).toBe(4);
    expect(plan.step).toBe(4);
    expect(plan.limit).toBeNull();

    const decision = resolveMasterLoudness({ ...streaming, measuredLufs: -18, truePeakDb: -12 });
    expect(decision.step).toBe(4);
    expect(decision.offset).toBe(0);
    expect(decision.changesKnob).toBe(false);
    expect(decision.reply).toContain("+4");
    expect(decision.reply).not.toContain("+3");
    expect(decision.reply).toContain("zostaje na 0");
  });

  it("limits the step by true-peak headroom and says why, with the real peak", () => {
    const plan = planMasterLoudnessStep({
      measuredLufs: -18,
      targetLufs: -14,
      truePeakDb: -4.5,
      ceilingDb: -1,
    });
    expect(plan.ideal).toBe(4);
    expect(plan.step).toBe(3.5);
    expect(plan.limit).toBe("truePeak");
    expect(plan.predictedPeakDb).toBe(-0.5);

    const decision = resolveMasterLoudness({ ...streaming, measuredLufs: -18, truePeakDb: -4.5 });
    expect(decision.step).toBe(3.5);
    expect(decision.offset).toBe(-0.5);
    expect(decision.reply).toContain("+3.5");
    expect(decision.reply).toContain("nie +4");
    expect(decision.reply).toContain("\u22124.5 dBTP");
    expect(decision.reply).toContain("\u22120.5 dBTP");
    expect(decision.reply).toContain("0 → \u22120.5");
  });

  it("turns down when the song is already louder than the target", () => {
    const plan = planMasterLoudnessStep({
      measuredLufs: -10,
      targetLufs: -14,
      truePeakDb: -1,
      ceilingDb: -1,
    });
    expect(plan.ideal).toBe(-4);
    expect(plan.step).toBe(-4);
    expect(plan.limit).toBeNull();

    const decision = resolveMasterLoudness({ ...streaming, measuredLufs: -10, truePeakDb: -1 });
    expect(decision.step).toBe(-4);
    expect(decision.offset).toBe(0);
    expect(decision.reply).toContain("Ściszam o 4 LU");
    expect(decision.reply).toContain("\u221210 LUFS");
    expect(decision.reply).not.toContain("+3");
  });
});
