import { describe, expect, it } from "vitest";

import { beatGenerationPercent } from "@/lib/beats/ai-beat/generation-progress";

describe("beat generation percent", () => {
  it("follows the stage and never reaches 100 while the file is still pending", () => {
    expect(beatGenerationPercent("starting", 0)).toBe(12);
    expect(beatGenerationPercent("waiting", 0)).toBe(28);
    expect(beatGenerationPercent("waiting", 3)).toBe(52);
    expect(beatGenerationPercent("waiting", 8)).toBe(92);
    expect(beatGenerationPercent("waiting", 40)).toBe(92);
    expect(beatGenerationPercent("waiting", -2)).toBe(28);
    expect(beatGenerationPercent("saving", 0)).toBe(96);
    expect(beatGenerationPercent("ready", 0)).toBe(100);
  });
});
