import { describe, expect, it } from "vitest";

import {
  barDurationMs,
  planHipHopStructureMarkers,
} from "@/lib/studio/hiphop-marker-structure";

describe("hiphop-marker-structure", () => {
  it("places verse/hook markers on bar grid at 90 BPM", () => {
    const bar = barDurationMs(90);
    expect(bar).toBeCloseTo(2666.666, 2);
    const markers = planHipHopStructureMarkers({ bpm: 90 });
    expect(markers[0]).toMatchObject({ label: "Intro", kind: "verse", positionMs: 0 });
    expect(markers[1]?.kind).toBe("verse");
    expect(markers[1]?.positionMs).toBe(Math.round(4 * bar));
    expect(markers[2]).toMatchObject({
      label: "Refren 1",
      kind: "hook",
      positionMs: Math.round(20 * bar),
    });
    expect(markers.length).toBe(6);
  });

  it("respects marker capacity", () => {
    expect(planHipHopStructureMarkers({ bpm: 90, maxMarkers: 2 })).toHaveLength(2);
  });
});
