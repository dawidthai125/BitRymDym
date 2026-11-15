import { describe, expect, it } from "vitest";

import { levelFactLines, measurePcmLevel } from "@/lib/beats/ai-beat/level";

describe("generated beat level", () => {
  it("calls silence empty and a real peak a sound", () => {
    const silent = measurePcmLevel(new Float32Array(2000));
    expect(silent.empty).toBe(true);
    expect(silent.peakDb).toBe(-120);

    const tone = new Float32Array(2000);
    tone[10] = 0.5;
    const loud = measurePcmLevel(tone);
    expect(loud.empty).toBe(false);
    expect(loud.peakDb).toBeCloseTo(-6, 0);
    expect(levelFactLines(loud.peakDb, loud.rmsDb)[1]).toBe("Nagranie: jest dźwięk.");
    expect(levelFactLines(null, null)[0]).toBe("Głośność: niezmierzona.");
  });
});
