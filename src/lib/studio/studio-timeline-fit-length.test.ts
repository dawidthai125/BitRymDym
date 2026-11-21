import { describe, expect, it } from "vitest";

import { studioTimelineFitLengthMs } from "@/lib/studio/studio-timeline-view";

describe("studioTimelineFitLengthMs", () => {
  it("fits the last clip plus room instead of the 6:00 canvas", () => {
    expect(studioTimelineFitLengthMs(360_000, [{ timelineStartMs: 0, durationMs: 170_000 }])).toBe(183_600);
  });
  it("keeps the whole canvas when the project is empty", () => {
    expect(studioTimelineFitLengthMs(360_000, [])).toBe(360_000);
  });
  it("never goes past the canvas and never below 30 s", () => {
    expect(studioTimelineFitLengthMs(360_000, [{ timelineStartMs: 350_000, durationMs: 10_000 }])).toBe(360_000);
    expect(studioTimelineFitLengthMs(360_000, [{ timelineStartMs: 0, durationMs: 2_000 }])).toBe(30_000);
  });
});
