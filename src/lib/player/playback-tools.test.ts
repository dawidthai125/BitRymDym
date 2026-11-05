import { describe, expect, it } from "vitest";

import { clampPlaybackGain, nextBrdPlaybackRate } from "./playback-tools";

describe("playback tools", () => {
  it("cycles the listen speeds", () => {
    expect(nextBrdPlaybackRate(1)).toBe(1.25);
    expect(nextBrdPlaybackRate(1.25)).toBe(0.75);
    expect(nextBrdPlaybackRate(0.75)).toBe(1);
    expect(nextBrdPlaybackRate(2)).toBe(1.25);
  });

  it("keeps gain inside 0..1", () => {
    expect(clampPlaybackGain(1.4)).toBe(1);
    expect(clampPlaybackGain(-0.2)).toBe(0);
    expect(clampPlaybackGain(Number.NaN)).toBe(1);
  });
});
