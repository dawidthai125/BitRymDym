import { describe, expect, it } from "vitest";

import {
  buildStudioBarRulerTicks,
  buildStudioGrid,
  parseStudioViewPrefs,
  studioGridOriginMs,
  STUDIO_VIEW_PREFS_DEFAULT,
} from "@/lib/studio/studio-grid";
import {
  snapConfigFromPreset,
  snapPresetFromConfig,
  snapTimelineMs,
  withStudioSnapGrid,
} from "@/lib/studio/studio-timeline-view";

const grid = buildStudioGrid({ bpm: 92, timeSignatureNum: 4, timeSignatureDen: 4, originMs: 0 })!;

describe("Studio musical grid", () => {
  it("puts bar 1 at the start of the beat file plus the user's correction", () => {
    expect(studioGridOriginMs([], 0)).toBe(0);
    expect(studioGridOriginMs([{ timelineStartMs: 5000, sourceOffsetMs: 2000 }], 0)).toBe(3000);
    expect(
      studioGridOriginMs(
        [
          { timelineStartMs: 60_000, sourceOffsetMs: 0 },
          { timelineStartMs: 0, sourceOffsetMs: 1000 },
        ],
        120,
      ),
    ).toBe(-880);
  });

  it("labels bars and does not drift over a whole song", () => {
    const ticks = buildStudioBarRulerTicks({ grid, timelineLengthMs: 360_000, pxPerMs: 0.003 });
    expect(ticks[0]).toEqual({ ms: 0, label: "1" });
    const labelled = ticks.filter((t) => t.label);
    for (const tick of labelled) {
      const bar = Number(tick.label);
      expect(Math.abs(tick.ms - (bar - 1) * grid.beatMs * 4)).toBeLessThanOrEqual(0.5);
    }
    for (let i = 1; i < labelled.length; i += 1) {
      expect((labelled[i]!.ms - labelled[i - 1]!.ms) * 0.003).toBeGreaterThanOrEqual(40);
    }
  });

  it("shows bar.beat when zoomed in and nothing before bar 1", () => {
    const shifted = { ...grid, originMs: 1000 };
    const ticks = buildStudioBarRulerTicks({ grid: shifted, timelineLengthMs: 5000, pxPerMs: 0.1 });
    expect(ticks[0]).toEqual({ ms: 1000, label: "1" });
    expect(ticks[1]?.label).toBe("1.2");
    const negative = buildStudioBarRulerTicks({ grid: { ...grid, originMs: -700 }, timelineLengthMs: 5000, pxPerMs: 0.1 });
    expect(negative[0]).toMatchObject({ label: "1.3" });
    expect(negative[0]!.ms).toBeGreaterThanOrEqual(0);
  });

  it("snaps to beats and bars from the project tempo and bar 1", () => {
    const beat = withStudioSnapGrid(snapConfigFromPreset("beat"), grid);
    const bar = withStudioSnapGrid(snapConfigFromPreset("bar"), { ...grid, originMs: 250 });
    expect(snapPresetFromConfig(beat)).toBe("beat");
    expect(snapTimelineMs(1900, beat)).toBe(Math.round(3 * grid.beatMs));
    // The 40th beat stays exact: no accumulated rounding.
    expect(snapTimelineMs(Math.round(40 * grid.beatMs) + 100, beat)).toBe(Math.round(40 * grid.beatMs));
    expect(snapTimelineMs(2500, bar)).toBe(Math.round(250 + grid.beatMs * 4));
    expect(snapTimelineMs(0, bar, { minMs: 0, maxMs: 10_000 })).toBe(250);
    expect(withStudioSnapGrid(snapConfigFromPreset("100"), grid).gridIntervalMs).toBe(100);
    expect(withStudioSnapGrid(snapConfigFromPreset("bar"), null).mode).toBe("off");
  });

  it("reads stored view preferences defensively", () => {
    expect(parseStudioViewPrefs(null)).toEqual(STUDIO_VIEW_PREFS_DEFAULT);
    expect(parseStudioViewPrefs("{bad")).toEqual(STUDIO_VIEW_PREFS_DEFAULT);
    expect(parseStudioViewPrefs('{"lanes":"low","gridShiftMs":12.6,"ruler":"x"}')).toEqual({
      ruler: "bars",
      lanes: "low",
      gridShiftMs: 13,
    });
  });
});
