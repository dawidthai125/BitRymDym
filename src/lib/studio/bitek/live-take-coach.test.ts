import { describe, expect, it } from "vitest";

import { decideLiveTakeCoach, type LiveCoachSample } from "./live-take-coach";

function steady(peakDb: number, count = 20, playhead: number | null = null): LiveCoachSample[] {
  return Array.from({ length: count }, (_, i) => ({
    atMs: i * 100,
    peakDb,
    playheadMs: playhead == null ? null : playhead + i * 100,
  }));
}

function judge(samples: LiveCoachSample[], bpm = 120, last: LiveCoachSample extends never ? never : "hot" | "quiet" | "uneven" | "offbeat" | null = null) {
  const nowMs = samples[samples.length - 1]?.atMs ?? 0;
  return decideLiveTakeCoach({ samples, nowMs, bpm, lastCue: last, lastCueAtMs: last ? 0 : null });
}

describe("decideLiveTakeCoach", () => {
  it("stays quiet until the window is long enough", () => {
    const decision = judge(steady(-0.2, 4));
    expect(decision.ready).toBe(false);
    expect(decision.speak).toBe(false);
    expect(decision.clear).toBe(false);
  });

  it("says the take is too hot", () => {
    const samples = steady(-12);
    samples[10] = { atMs: 1000, peakDb: -0.4, playheadMs: null };
    const decision = judge(samples);
    expect(decision.cue).toBe("hot");
    expect(decision.speak).toBe(true);
  });

  it("says the take is quiet when the voice stays low", () => {
    expect(judge(steady(-28)).cue).toBe("quiet");
  });

  it("does not nag silence", () => {
    const decision = judge(steady(-60), 120, "hot");
    expect(decision.cue).toBeNull();
    expect(decision.clear).toBe(true);
    expect(decision.speak).toBe(false);
  });

  it("says the level is uneven when the clock is missing", () => {
    const samples: LiveCoachSample[] = [];
    for (let i = 0; i < 20; i += 1) {
      const loud = Math.floor(i / 4) % 2 === 0;
      samples.push({ atMs: i * 100, peakDb: loud ? -8 : -26, playheadMs: null });
    }
    expect(judge(samples).cue).toBe("uneven");
  });

  it("says the vocal is off the beat", () => {
    const samples = steady(-36, 21, 0);
    for (const at of [200, 700, 1200, 1700]) {
      const index = at / 100;
      samples[index] = { atMs: at, peakDb: -10, playheadMs: at };
    }
    expect(judge(samples, 120).cue).toBe("offbeat");
  });

  it("stays silent when the vocal lands on the beat", () => {
    const samples = steady(-12, 21, 0);
    expect(judge(samples, 120).cue).toBeNull();
  });

  it("does not repeat the same cue inside the cooldown", () => {
    const samples = steady(-28);
    const nowMs = samples[samples.length - 1]?.atMs ?? 0;
    const decision = decideLiveTakeCoach({
      samples,
      nowMs,
      bpm: 120,
      lastCue: "quiet",
      lastCueAtMs: nowMs - 500,
    });
    expect(decision.cue).toBe("quiet");
    expect(decision.speak).toBe(false);
  });

  it("lets a hot peak interrupt another cue", () => {
    const samples = steady(-12);
    samples[10] = { atMs: 1000, peakDb: -0.2, playheadMs: null };
    const decision = decideLiveTakeCoach({
      samples,
      nowMs: 1900,
      bpm: 120,
      lastCue: "quiet",
      lastCueAtMs: 1800,
    });
    expect(decision.cue).toBe("hot");
    expect(decision.speak).toBe(true);
  });
});
