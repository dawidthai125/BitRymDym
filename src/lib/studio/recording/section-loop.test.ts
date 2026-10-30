import { describe, expect, it } from "vitest";

import {
  alignedPlacement,
  buildCapturedPasses,
  loopPassStarts,
  prerollCountdown,
  punchLineWindow,
  recordingPositionOf,
  sectionLines,
  sectionRange,
  snapToBarMs,
  type PlayheadSample,
} from "@/lib/studio/recording/section-loop";

const BAR = 2000; // 120 BPM 4/4

describe("section geometry", () => {
  it("snaps to bars", () => {
    expect(snapToBarMs(2900, BAR)).toBe(2000);
    expect(snapToBarMs(3100, BAR)).toBe(4000);
    expect(snapToBarMs(3999, BAR, "floor")).toBe(2000);
  });

  it("builds 4/8/16-bar sections clamped to the timeline", () => {
    expect(sectionRange({ startMs: 4500, bars: 4, barMs: BAR, timelineLengthMs: 240000 })).toEqual({
      startMs: 4000,
      endMs: 12000,
    });
    // Near the end → shifted back to fit.
    expect(sectionRange({ startMs: 19000, bars: 8, barMs: BAR, timelineLengthMs: 20000 })).toEqual({
      startMs: 4000,
      endMs: 20000,
    });
    expect(sectionLines({ startMs: 4000, endMs: 12000 }, BAR)).toHaveLength(4);
  });

  it("punch window enters one bar earlier", () => {
    expect(punchLineWindow({ line: { startMs: 8000, endMs: 10000 }, barMs: BAR, beatMs: 500 })).toEqual({
      recordFromMs: 6000,
      prerollMs: 2000,
      stopAtMs: 10500,
    });
  });

  it("counts down 4-3-2-1 during pre-roll", () => {
    const c = (p: number) => prerollCountdown({ playheadMs: p, targetMs: 8000, beatMs: 500, prerollMs: 2000 });
    expect([c(6000), c(6600), c(7100), c(7600), c(8000)]).toEqual([4, 3, 2, 1, null]);
  });
});

/** Simulate transport polling: playhead runs from `from`, loops [S,E), sampled every 33 ms with jitter. */
function simulate(params: {
  recT0: number;
  playStartPerf: number;
  fromMs: number;
  section?: { startMs: number; endMs: number };
  untilPerf: number;
}): PlayheadSample[] {
  const out: PlayheadSample[] = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Paused samples before play (must be ignored).
  for (let t = params.recT0; t < params.playStartPerf; t += 33) {
    out.push({ perfMs: t, playheadMs: params.fromMs });
  }
  for (let t = params.playStartPerf; t < params.untilPerf; t += 33) {
    const perf = t + r() * 4;
    let ph = params.fromMs + (perf - params.playStartPerf);
    if (params.section) {
      const { startMs: S, endMs: E } = params.section;
      if (ph >= E) ph = S + ((ph - S) % (E - S));
    }
    out.push({ perfMs: perf, playheadMs: ph });
  }
  return out;
}

describe("alignment", () => {
  it("finds where a timeline position sits in the recording", () => {
    const samples = simulate({ recT0: 1000, playStartPerf: 1180, fromMs: 6000, untilPerf: 6000 });
    // playhead 8000 at perf 1180 + 2000 = 3180 → rec 2180
    expect(recordingPositionOf({ samples, targetMs: 8000, recordStartPerfMs: 1000 })).toBeCloseTo(2180, 0);
  });

  it("splits loop passes and builds compensated sub-ranges", () => {
    const section = { startMs: 8000, endMs: 16000 };
    // Pre-roll from 6000; 3 full passes + 2.5 s of a 4th.
    const samples = simulate({
      recT0: 500,
      playStartPerf: 700,
      fromMs: 6000,
      section,
      untilPerf: 700 + 2000 + 3 * 8000 + 2500,
    });
    const starts = loopPassStarts({ samples, section, recordStartPerfMs: 500 });
    expect(starts).toHaveLength(4);
    starts.forEach((s, k) => expect(s).toBeCloseTo(200 + 2000 + k * 8000, -1));
    const takeDurationMs = 2000 + 3 * 8000 + 2500 + 200;
    const passes = buildCapturedPasses({
      passStartsRecMs: starts,
      section,
      takeDurationMs,
      compensationMs: 40,
    });
    expect(passes).toHaveLength(4);
    expect(passes.slice(0, 3).every((p) => p.complete)).toBe(true);
    expect(passes[0]!.sourceOffsetMs).toBeCloseTo(2240, -1);
    expect(passes[3]!.complete).toBe(false);
    expect(passes[3]!.rangeEndMs - passes[3]!.rangeStartMs).toBeLessThan(8000);
  });

  it("places single takes with latency, shifting start when offset < 0", () => {
    expect(alignedPlacement({ startMs: 4000, recPositionMs: -30, compensationMs: 50 })).toEqual({
      timelineStartMs: 4000,
      sourceOffsetMs: 20,
    });
    expect(alignedPlacement({ startMs: 4000, recPositionMs: -80, compensationMs: 50 })).toEqual({
      timelineStartMs: 4030,
      sourceOffsetMs: 0,
    });
  });
});
