/**
 * React mount — real Waveform DOM bbox (catalog + sticky regression).
 * Desktop 1280×800 · mobile 390×844. No seek clicks. No Supabase.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeCatalogWaveformMountHost,
  measureCatalogWaveformAt,
} from "@/components/player/catalog-waveform-seek-target.mount-host";

const MIN_HIT_PX = 44;

describe("catalog waveform seek — Waveform React mount", () => {
  afterAll(async () => {
    await closeCatalogWaveformMountHost();
  });

  it("catalog default h-7 @ 1280×800: seek ≥44×44, visual ~28, catalog attr, no audio/network", async () => {
    const m = await measureCatalogWaveformAt({ width: 1280, height: 800 });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seekHitValue).toBe("catalog");
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(28);
    expect(m.audioElementCount).toBe(0);
    expect(m.networkNonLocal).toBe(0);
    expect(m.seekCallbackWired).toBe(false);
  }, 90_000);

  it("catalog default h-7 @ 390×844: seek ≥44×44, visual ~28, catalog attr, no audio/network", async () => {
    const m = await measureCatalogWaveformAt({ width: 390, height: 844 });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seekHitValue).toBe("catalog");
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(28);
    expect(m.audioElementCount).toBe(0);
    expect(m.networkNonLocal).toBe(0);
    expect(m.seekCallbackWired).toBe(false);
  }, 90_000);

  it("catalog heightClassName h-6 @ 1280×800: seek ≥44×44, visual ~24, no audio", async () => {
    const m = await measureCatalogWaveformAt({
      width: 1280,
      height: 800,
      heightClassName: "h-6",
    });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seekHitValue).toBe("catalog");
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(24);
    expect(m.audioElementCount).toBe(0);
    expect(m.networkNonLocal).toBe(0);
  }, 90_000);

  it("catalog heightClassName h-6 @ 390×844: seek ≥44×44, visual ~24, no audio", async () => {
    const m = await measureCatalogWaveformAt({
      width: 390,
      height: 844,
      heightClassName: "h-6",
    });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(24);
    expect(m.audioElementCount).toBe(0);
    expect(m.networkNonLocal).toBe(0);
  }, 90_000);

  it("sticky density @ 390×844: seek ≥44×44, visual ~20, sticky attr, no audio", async () => {
    const m = await measureCatalogWaveformAt({
      width: 390,
      height: 844,
      density: "sticky",
    });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.hasSeekHitAttr).toBe(true);
    expect(m.seekHitValue).toBe("sticky");
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(
      MIN_HIT_PX,
    );
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(20);
    expect(m.audioElementCount).toBe(0);
    expect(m.networkNonLocal).toBe(0);
    expect(m.seekCallbackWired).toBe(false);
  }, 90_000);
});
