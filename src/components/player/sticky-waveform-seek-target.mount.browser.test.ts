/**
 * React mount — real StickyMiniPlayer DOM bbox (not CSS-only fixture).
 * Desktop 1280×800 · mobile 390×844. No Play/seek/audio clicks. No Supabase.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeStickyMountHost,
  measureStickyMiniPlayerAt,
} from "@/components/player/sticky-mini-player.mount-host";

const MIN_HIT_PX = 44;
const VISUAL_H_PX = 20;

describe("sticky waveform seek — StickyMiniPlayer React mount", () => {
  afterAll(async () => {
    await closeStickyMountHost();
  });

  it("desktop 1280×800: real mount seek ≥44×44, visual ~20, no Play/Close overlap, no audio", async () => {
    const m = await measureStickyMiniPlayerAt({ width: 1280, height: 800 });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(VISUAL_H_PX);
    expect(m.play.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.play.height).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.overlapPlay).toBe(false);
    expect(m.overlapClose).toBe(false);
    expect(m.audioElementCount).toBe(0);
  }, 90_000);

  it("mobile 390×844: real mount seek ≥44×44, visual ~20, no Play/Close overlap, no audio", async () => {
    const m = await measureStickyMiniPlayerAt({ width: 390, height: 844 });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(VISUAL_H_PX);
    expect(m.overlapPlay).toBe(false);
    expect(m.overlapClose).toBe(false);
    expect(m.audioElementCount).toBe(0);
  }, 90_000);
});
