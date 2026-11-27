import { describe, expect, it } from "vitest";

import {
  beatSpeedPlayback,
  isBeatSpeedUp,
  isTapePlayback,
  maxBeatBpm,
  shiftKeyByCents,
  studioBeatPitchCents,
  studioHeardBpm,
  tapeCents,
} from "@/lib/studio/studio-beat-speed";
import { beatClipAt } from "@/lib/studio/recording/auto-align";
import { renderClipPlaybackMono } from "@/lib/studio/studio-clip-playback";

const beat = (stretchRatio: number, pitchCents: number) => ({ sourceKind: "BEAT_REF", stretchRatio, pitchCents });

describe("Tempo bitu", () => {
  it("stores a target BPM as a tape pair and reads the heard tempo back", () => {
    for (const target of [91, 95, 99, 105]) {
      const next = beatSpeedPlayback(90, target);
      expect(isBeatSpeedUp(next)).toBe(true);
      expect(studioHeardBpm(90, [beat(next.stretch, next.pitchCents)])).toBeCloseTo(target, 1);
    }
  });

  it("stays between normal speed and +25%", () => {
    expect(beatSpeedPlayback(90, 80)).toEqual({ stretch: 1, pitchCents: 0 });
    expect(beatSpeedPlayback(90, 200)).toEqual({ stretch: 0.8, pitchCents: 386 });
    expect(maxBeatBpm(90)).toBe(112);
  });

  it("is the only pitch change that every plan may write", () => {
    expect(isBeatSpeedUp({ stretch: 1, pitchCents: 0 })).toBe(true);
    expect(isBeatSpeedUp({ stretch: 1, pitchCents: 100 })).toBe(false);
    expect(isBeatSpeedUp({ stretch: 0.9, pitchCents: 700 })).toBe(false);
    expect(isBeatSpeedUp({ stretch: 0.9, pitchCents: 0 })).toBe(false);
    expect(isBeatSpeedUp({ stretch: 0.5, pitchCents: tapeCents(0.5) })).toBe(false);
    expect(isBeatSpeedUp({ stretch: 1.1, pitchCents: tapeCents(1.1) })).toBe(false);
    expect(isTapePlayback({ stretch: 0.9, pitchCents: 0 })).toBe(false);
  });

  it("leaves the tempo alone when the Bit pieces differ or only the tempo changed", () => {
    const fast = beatSpeedPlayback(90, 99);
    const take = { sourceKind: "TAKE", stretchRatio: 1, pitchCents: 0 };
    expect(studioHeardBpm(90, [beat(fast.stretch, fast.pitchCents), take])).toBeCloseTo(99, 1);
    expect(studioHeardBpm(90, [beat(fast.stretch, fast.pitchCents), beat(1, 0)])).toBe(90);
    expect(studioHeardBpm(90, [beat(fast.stretch, 0)])).toBe(90);
    expect(studioBeatPitchCents([take])).toBe(0);
  });

  it("moves the key by whole semitones and gives none between two keys", () => {
    expect(shiftKeyByCents({ keyRoot: 11, scale: 1 }, 200)).toEqual({ keyRoot: 1, scale: 1 });
    expect(shiftKeyByCents({ keyRoot: 9, scale: 1 }, 150)).toBeNull();
    expect(shiftKeyByCents({ keyRoot: 9, scale: 1 }, 0)).toEqual({ keyRoot: 9, scale: 1 });
  });

  it("keeps every hit on the new grid over a whole song and keeps the bass clean", () => {
    const sr = 8000;
    const next = beatSpeedPlayback(90, 99);
    const clicks = new Float32Array(sr * 150);
    for (let s = 1; s < 150; s += 1) clicks[s * sr] = 1;
    const fast = renderClipPlaybackMono(clicks, next);
    for (const second of [10, 60, 149]) {
      const expected = Math.round(second * sr * next.stretch);
      const around = Array.from(fast.subarray(expected - 3, expected + 4), Math.abs);
      expect(Math.max(...around)).toBeGreaterThan(0.2);
    }
    const bass = Float32Array.from({ length: sr * 4 }, (_, i) => Math.sin((2 * Math.PI * 55 * i) / sr));
    const out = renderClipPlaybackMono(bass, next);
    const step = bass.length / out.length;
    let worst = 0;
    for (let i = 100; i < out.length - 100; i += 1) {
      worst = Math.max(worst, Math.abs(out[i]! - Math.sin((2 * Math.PI * 55 * i * step) / sr)));
    }
    expect(worst).toBeLessThan(0.02);
  });

  it("still finds the faster Bit for the automatic vocal alignment", () => {
    const tracks = [{ id: "t", muted: false, solo: false }];
    const clip = { trackId: "t", sourceKind: "BEAT_REF", timelineStartMs: 0, durationMs: 100_000, sourceOffsetMs: 0, muted: false };
    expect(beatClipAt([{ ...clip, ...{ stretchRatio: 0.9091, pitchCents: 165 } }], tracks, 0)).not.toBeNull();
    expect(beatClipAt([{ ...clip, stretchRatio: 0.9091, pitchCents: 0 }], tracks, 0)).toBeNull();
  });
});
