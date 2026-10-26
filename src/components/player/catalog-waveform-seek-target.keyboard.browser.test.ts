/**
 * Real Waveform mount — slider a11y + APG keyboard seek (±0.03, Home/End).
 * Desktop 1280×800 · mobile 390×844. No audio. Network aborted in host.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeCatalogWaveformMountHost,
  probeCatalogWaveformSeekKeyboardA11yAt,
} from "@/components/player/catalog-waveform-seek-target.mount-host";

describe("catalog waveform seek — keyboard a11y (real mount)", () => {
  afterAll(async () => {
    await closeCatalogWaveformMountHost();
  });

  it("desktop 1280×800: slider attrs, Tab focus, full APG keyboard seek", async () => {
    const p = await probeCatalogWaveformSeekKeyboardA11yAt({
      width: 1280,
      height: 800,
    });
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.sliderVisible).toBe(true);
    expect(p.passInitialA11y, JSON.stringify(p)).toBe(true);
    expect(p.passTabFocus).toBe(true);
    expect(p.passArrowRight, JSON.stringify(p)).toBe(true);
    expect(p.passArrowLeft, JSON.stringify(p)).toBe(true);
    expect(p.passArrowUp, JSON.stringify(p)).toBe(true);
    expect(p.passArrowDown, JSON.stringify(p)).toBe(true);
    expect(p.passHome, JSON.stringify(p)).toBe(true);
    expect(p.passEnd, JSON.stringify(p)).toBe(true);
    expect(p.passNoAudioOrNetwork).toBe(true);
  }, 90_000);

  it("mobile 390×844: slider attrs, Tab focus, full APG keyboard seek", async () => {
    const p = await probeCatalogWaveformSeekKeyboardA11yAt({
      width: 390,
      height: 844,
    });
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.sliderVisible).toBe(true);
    expect(p.passInitialA11y, JSON.stringify(p)).toBe(true);
    expect(p.passTabFocus).toBe(true);
    expect(p.passArrowRight, JSON.stringify(p)).toBe(true);
    expect(p.passArrowLeft, JSON.stringify(p)).toBe(true);
    expect(p.passArrowUp, JSON.stringify(p)).toBe(true);
    expect(p.passArrowDown, JSON.stringify(p)).toBe(true);
    expect(p.passHome, JSON.stringify(p)).toBe(true);
    expect(p.passEnd, JSON.stringify(p)).toBe(true);
    expect(p.passNoAudioOrNetwork).toBe(true);
  }, 90_000);
});
