import { describe, expect, it } from "vitest";

import {
  planDoubledClipStartMs,
  planVocalDoubler,
  VOCAL_DOUBLER_OFFSET_MS,
} from "@/lib/studio/vocal-doubler-plan";

describe("vocal-doubler-plan", () => {
  it("plans stereo R double with offset and detune", () => {
    const p = planVocalDoubler("R");
    expect(p.offsetMs).toBe(VOCAL_DOUBLER_OFFSET_MS);
    expect(p.pan).toBeGreaterThan(0);
    expect(p.pitchCents).toBeGreaterThan(0);
    expect(p.trackRole).toBe("double");
  });

  it("mirrors L side", () => {
    const l = planVocalDoubler("L");
    const r = planVocalDoubler("R");
    expect(l.pan).toBe(-r.pan);
    expect(l.pitchCents).toBe(-r.pitchCents);
  });

  it("offsets clip start", () => {
    expect(planDoubledClipStartMs(1000)).toBe(1000 + VOCAL_DOUBLER_OFFSET_MS);
    expect(planDoubledClipStartMs(0)).toBe(VOCAL_DOUBLER_OFFSET_MS);
  });
});
