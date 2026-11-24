import { describe, expect, it } from "vitest";

import { loopLengthFrames, wholeBars } from "./sample-lab-dsp";

describe("wholeBars", () => {
  const rate = 48_000;
  it("keeps the wanted bars when all of them are there", () => {
    expect(wholeBars(loopLengthFrames(90, 4, rate), 90, rate, 4)).toBe(4);
    expect(wholeBars(loopLengthFrames(90, 16, rate), 90, rate, 4)).toBe(4);
  });
  it("a loop stopped early is labelled with what was played", () => {
    expect(wholeBars(loopLengthFrames(90, 3, rate), 90, rate, 4)).toBe(2);
    expect(wholeBars(loopLengthFrames(90, 1, rate), 90, rate, 4)).toBe(1);
  });
  it("less than one bar is nothing, also after a stop in the count-in", () => {
    expect(wholeBars(rate, 90, rate, 4)).toBe(0);
    expect(wholeBars(-rate, 90, rate, 4)).toBe(0);
  });
  it("a file a few milliseconds short still counts", () => {
    expect(wholeBars(loopLengthFrames(90, 2, rate) - 1000, 90, rate, 2)).toBe(2);
  });
});
