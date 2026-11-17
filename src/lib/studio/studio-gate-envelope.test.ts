import { describe, expect, it } from "vitest";

import { GateEnvelopeCore } from "@/lib/studio/studio-gate-envelope";

describe("GateEnvelopeCore", () => {
  it("holds open after a peak before release", () => {
    const core = new GateEnvelopeCore(1000, {
      thresholdDb: -40,
      rangeDb: 20,
      attackMs: 0,
      holdMs: 40,
      releaseMs: 100,
    });
    // 40 ms hold @ 1 kHz = 40 samples
    core.step(1);
    expect(core.level).toBeGreaterThan(0.9);
    for (let i = 0; i < 39; i++) core.step(0);
    expect(core.holdLeft).toBeGreaterThan(0);
    const held = core.level;
    core.step(0);
    expect(core.level).toBeCloseTo(held, 5);
  });

  it("attenuates below threshold after hold", () => {
    const core = new GateEnvelopeCore(48000, {
      thresholdDb: -20,
      rangeDb: 12,
      attackMs: 0,
      holdMs: 0,
      releaseMs: 0,
    });
    const quiet = 10 ** (-40 / 20);
    const g = core.gainFor(core.step(quiet));
    expect(20 * Math.log10(g)).toBeLessThan(-5);
  });
});
