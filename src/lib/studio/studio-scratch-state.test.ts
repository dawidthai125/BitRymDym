import { describe, expect, it } from "vitest";

import {
  SCRATCH_DEFAULT_RATE,
  SCRATCH_RATE_MAX,
  SCRATCH_RATE_MIN,
  applyScratchJogDelta,
  approveScratchLive,
  assertScratchExportEncodable,
  clampScratchCueMs,
  clampScratchRate,
  resolveScratchSourceMs,
  defaultScratchLiveState,
  releaseScratchJog,
  setScratchCue,
  parseScratchApprovedForWrite,
  studioScratchLivePlaybackRate,
  toggleScratchReverse,
} from "@/lib/studio/studio-scratch-state";

describe("studio-scratch-state", () => {
  it("clamps illegal rates instead of crashing", () => {
    expect(clampScratchRate(Number.NaN)).toBe(SCRATCH_DEFAULT_RATE);
    expect(clampScratchRate(0)).toBe(SCRATCH_RATE_MIN);
    expect(clampScratchRate(99)).toBe(SCRATCH_RATE_MAX);
  });

  it("clamps cue into the source window", () => {
    expect(clampScratchCueMs(-12, 4000)).toBe(0);
    expect(clampScratchCueMs(5000, 4000)).toBe(3999);
    expect(clampScratchCueMs(250, 4000)).toBe(250);
  });

  it("jog changes rate and release returns to approved transport rate", () => {
    const approved = {
      cueMs: 120,
      reverse: false,
      rate: 1,
    };
    const live = applyScratchJogDelta(defaultScratchLiveState(), 40);
    expect(live.jogging).toBe(true);
    expect(live.rate).toBeGreaterThan(1);
    const released = releaseScratchJog(live, approved);
    expect(released.jogging).toBe(false);
    expect(released.rate).toBe(1);
    expect(released.cueMs).toBe(120);
  });

  it("approve copies live cue/reverse/rate", () => {
    const live = setScratchCue(
      toggleScratchReverse(applyScratchJogDelta(defaultScratchLiveState(), 10)),
      800,
      2000,
    );
    expect(approveScratchLive(live)).toEqual({
      cueMs: 800,
      reverse: true,
      rate: live.rate,
    });
  });

  it("live rate magnitude stays positive; reverse is a separate flag", () => {
    const reversed = toggleScratchReverse(defaultScratchLiveState());
    expect(reversed.reverse).toBe(true);
    expect(studioScratchLivePlaybackRate(reversed)).toBe(1);
  });

  it("parses approved scratch write values and clamps rate", () => {
    expect(
      parseScratchApprovedForWrite({ cueMs: 12.8, reverse: true, rate: 9 }),
    ).toEqual({ cueMs: 12, reverse: true, rate: SCRATCH_RATE_MAX });
    expect(() =>
      parseScratchApprovedForWrite({ cueMs: -1, reverse: false, rate: 1 }),
    ).toThrow(/cue/i);
  });

  it("export accepts approved reverse and non-unity rate for offline bake", () => {
    expect(
      assertScratchExportEncodable({ cueMs: 0, reverse: false, rate: 1 }),
    ).toEqual({ ok: true });
    expect(
      assertScratchExportEncodable({ cueMs: 0, reverse: true, rate: 1 }),
    ).toEqual({ ok: true });
    expect(
      assertScratchExportEncodable({ cueMs: 80, reverse: false, rate: 1.2 }),
    ).toEqual({ ok: true });
    expect(
      assertScratchExportEncodable({
        cueMs: Number.NaN,
        reverse: false,
        rate: 1,
      }).ok,
    ).toBe(false);
  });

  it("maps approved cue/rate/reverse onto source time", () => {
    expect(
      resolveScratchSourceMs({
        sourceOffsetMs: 100,
        localMs: 50,
        approved: { cueMs: 20, reverse: false, rate: 1 },
        sourceDurationMs: 4000,
      }),
    ).toBe(170);
    expect(
      resolveScratchSourceMs({
        sourceOffsetMs: 0,
        localMs: 100,
        approved: { cueMs: 0, reverse: false, rate: 2 },
        sourceDurationMs: 4000,
      }),
    ).toBe(200);
    expect(
      resolveScratchSourceMs({
        sourceOffsetMs: 0,
        localMs: 250,
        approved: { cueMs: 0, reverse: true, rate: 1 },
        sourceDurationMs: 1000,
      }),
    ).toBeCloseTo(750, 3);
  });
});
