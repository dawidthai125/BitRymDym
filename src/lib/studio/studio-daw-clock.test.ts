import { describe, expect, it } from "vitest";

import {
  barDurationMs,
  beatDurationMs,
  clickTimesMs,
  countInDurationMs,
  countInSeekMs,
  findOverlappingTakeClip,
  fireStudioClick,
  loopRegionOrNull,
  normalizePunchWindow,
  renderClickPcm,
  shouldAutoStopPunch,
  wrapLoopPlayhead,
} from "@/lib/studio/studio-daw-clock";

describe("studio-daw-clock", () => {
  it("derives beat/bar/count-in from project tempo", () => {
    expect(beatDurationMs(120)).toBe(500);
    expect(barDurationMs(120, 4, 4)).toBe(2000);
    expect(countInDurationMs(120, 1)).toBe(2000);
    expect(countInDurationMs(120, 0)).toBe(0);
    expect(countInSeekMs(8000, 2000)).toBe(6000);
    expect(countInSeekMs(500, 2000)).toBe(0);
  });

  it("normalizes punch and auto-stops at punch-out", () => {
    expect(
      normalizePunchWindow({
        punchInMs: 1000,
        punchOutMs: 4000,
        timelineLengthMs: 60_000,
      }),
    ).toEqual({ punchInMs: 1000, punchOutMs: 4000 });
    expect(
      normalizePunchWindow({
        punchInMs: 4000,
        punchOutMs: 1000,
        timelineLengthMs: 60_000,
      }),
    ).toBeNull();
    expect(shouldAutoStopPunch(3999, 4000)).toBe(false);
    expect(shouldAutoStopPunch(4000, 4000)).toBe(true);
    expect(shouldAutoStopPunch(5000, null)).toBe(false);
  });

  it("wraps playhead inside a loop region on the existing clock", () => {
    expect(wrapLoopPlayhead(7999, 4000, 8000)).toBe(7999);
    expect(wrapLoopPlayhead(8000, 4000, 8000)).toBe(4000);
    expect(wrapLoopPlayhead(8500, 4000, 8000)).toBe(4500);
    expect(
      loopRegionOrNull({
        enabled: true,
        startMs: 0,
        endMs: 8000,
        timelineLengthMs: 60_000,
      }),
    ).toEqual({ startMs: 0, endMs: 8000 });
    expect(
      loopRegionOrNull({
        enabled: true,
        startMs: 0,
        endMs: 10,
        timelineLengthMs: 60_000,
      }),
    ).toBeNull();
  });

  it("schedules accented bar clicks and renders a short PCM click", () => {
    const clicks = clickTimesMs({
      fromMs: 0,
      toMs: 2000,
      bpm: 120,
      timeSignatureNum: 4,
    });
    expect(clicks[0]).toEqual({ timeMs: 0, accent: true });
    expect(clicks.map((c) => c.timeMs)).toEqual([0, 500, 1000, 1500]);
    expect(clicks[1]?.accent).toBe(false);
    const pcm = renderClickPcm(44_100, true);
    expect(pcm.length).toBeGreaterThan(32);
    expect(pcm.some((s) => s !== 0)).toBe(true);
    const started: number[] = [];
    const dest = {};
    const ok = fireStudioClick(
      {
        sampleRate: 44_100,
        currentTime: 1.25,
        destination: dest,
        createBuffer: (_c, length, _rate) => ({
          getChannelData: () => new Float32Array(length),
        }),
        createBufferSource: () => ({
          buffer: null,
          connect: () => {},
          start: (when?: number) => {
            started.push(when ?? 0);
          },
        }),
      },
      true,
    );
    expect(ok).toBe(true);
    expect(started).toEqual([1.25]);
  });

  it("finds an overlapping TAKE clip for Replace", () => {
    const clips = [
      {
        trackId: "vocal",
        sourceKind: "TAKE" as const,
        timelineStartMs: 1000,
        durationMs: 3000,
      },
      {
        trackId: "vocal",
        sourceKind: "BEAT_REF" as const,
        timelineStartMs: 0,
        durationMs: 60_000,
      },
    ];
    expect(
      findOverlappingTakeClip(clips, {
        trackId: "vocal",
        startMs: 2000,
        durationMs: 2000,
      }),
    ).toEqual(clips[0]);
    expect(
      findOverlappingTakeClip(clips, {
        trackId: "vocal",
        startMs: 5000,
        durationMs: 1000,
      }),
    ).toBeUndefined();
  });
});
