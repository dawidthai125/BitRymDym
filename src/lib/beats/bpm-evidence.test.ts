import { describe, expect, it } from "vitest";

import { onsetGridAlignment } from "@/lib/beats/bpm-evidence";

describe("onsetGridAlignment", () => {
  it("scores high when onsets land on the grid", () => {
    const bpm = 120;
    const interval = 60 / bpm;
    const onsets = Float64Array.from(
      Array.from({ length: 20 }, (_, i) => i * interval + 0.01),
    );
    const hit = onsetGridAlignment({
      onsetTimes: onsets,
      bpm,
      durationSec: 10,
    });
    expect(hit).toBeGreaterThan(0.8);
  });

  it("scores low when onsets are off-grid", () => {
    const onsets = Float64Array.from(
      Array.from({ length: 20 }, (_, i) => i * 0.37 + 0.11),
    );
    const hit = onsetGridAlignment({
      onsetTimes: onsets,
      bpm: 120,
      durationSec: 10,
    });
    expect(hit).toBeLessThan(0.5);
  });

  it("is deterministic", () => {
    const onsets = Float64Array.from([0.5, 1.0, 1.5, 2.0]);
    const a = onsetGridAlignment({
      onsetTimes: onsets,
      bpm: 120,
      durationSec: 3,
    });
    const b = onsetGridAlignment({
      onsetTimes: onsets,
      bpm: 120,
      durationSec: 3,
    });
    expect(a).toBe(b);
  });
});
