import { describe, expect, it } from "vitest";

import { classifyExperimentMatch } from "@/lib/beats/bpm-experiment-v2/classify";

describe("experiment v2 classify", () => {
  it("labels exact / neighbor / harmonics / half", () => {
    expect(
      classifyExperimentMatch({ expectedBpm: 140, detectedBpm: 140 }),
    ).toBe("EXACT");
    expect(
      classifyExperimentMatch({ expectedBpm: 90, detectedBpm: 120 }),
    ).toBe("HARMONIC_4_3");
    expect(
      classifyExperimentMatch({ expectedBpm: 140, detectedBpm: 112 }),
    ).toBe("HARMONIC_3_4");
    expect(
      classifyExperimentMatch({ expectedBpm: 140, detectedBpm: 94 }),
    ).toBe("HARMONIC_2_3");
    expect(
      classifyExperimentMatch({ expectedBpm: 142, detectedBpm: 71 }),
    ).toBe("HALF");
    expect(
      classifyExperimentMatch({ expectedBpm: 100, detectedBpm: 99 }),
    ).toBe("WITHIN_1");
  });
});
