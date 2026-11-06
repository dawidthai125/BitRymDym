import { describe, expect, it } from "vitest";

import { playheadInsideClip } from "./studio-clip-ops";

describe("playheadInsideClip", () => {
  const clip = { timelineStartMs: 1000, durationMs: 2000 };

  it("is true strictly inside the clip", () => {
    expect(playheadInsideClip(clip, 1500)).toBe(true);
  });

  it("is false on the edges and outside", () => {
    expect(playheadInsideClip(clip, 1000)).toBe(false);
    expect(playheadInsideClip(clip, 3000)).toBe(false);
    expect(playheadInsideClip(clip, 500)).toBe(false);
    expect(playheadInsideClip(clip, 4000)).toBe(false);
  });

  it("is false without a selected clip", () => {
    expect(playheadInsideClip(null, 1500)).toBe(false);
    expect(playheadInsideClip(undefined, 1500)).toBe(false);
  });
});
