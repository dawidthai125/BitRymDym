import { describe, expect, it } from "vitest";

import type { StudioClipDto } from "@/lib/studio/studio-types";

import { beatRestorePlan, isClipLocked } from "./studio-beat-lock";

const clip = (over: Partial<StudioClipDto> = {}) =>
  ({ id: "b", trackId: "t", sourceKind: "BEAT_REF", timelineStartMs: 0, durationMs: 150_000, sourceOffsetMs: 0, stretchRatio: 1, ...over }) as StudioClipDto;

describe("Bit lock", () => {
  it("locks only the Bit, until it is unlocked", () => {
    expect(isClipLocked(clip(), false)).toBe(true);
    expect(isClipLocked(clip(), true)).toBe(false);
    expect(isClipLocked(clip({ sourceKind: "TAKE" }), false)).toBe(false);
    expect(isClipLocked(null, false)).toBe(false);
  });

  it("offers to put a moved or cut Bit back (the two cases from the owner's video)", () => {
    const back = { clipId: "b", timelineStartMs: 0, sourceOffsetMs: 0, durationMs: 150_000 };
    expect(beatRestorePlan([clip({ timelineStartMs: 6101 })], 150_000)).toEqual(back);
    expect(beatRestorePlan([clip({ durationMs: 32_095 })], 150_000)).toEqual(back);
    expect(beatRestorePlan([clip({ sourceOffsetMs: 4000, durationMs: 146_000 })], 150_000)).toEqual(back);
  });

  it("stays quiet for an untouched Bit, an arrangement, changed tempo or an unknown length", () => {
    expect(beatRestorePlan([clip()], 150_000)).toBeNull();
    expect(beatRestorePlan([clip({ durationMs: 149_980 })], 150_000)).toBeNull();
    expect(beatRestorePlan([clip({ durationMs: 30_000 }), clip({ id: "c", timelineStartMs: 30_000 })], 150_000)).toBeNull();
    expect(beatRestorePlan([clip({ stretchRatio: 1.1, durationMs: 160_000 })], 150_000)).toBeNull();
    expect(beatRestorePlan([clip({ timelineStartMs: 5 })], null)).toBeNull();
    expect(beatRestorePlan([clip({ sourceKind: "TAKE", timelineStartMs: 9 })], 150_000)).toBeNull();
  });
});
