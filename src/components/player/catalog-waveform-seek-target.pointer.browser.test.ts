/**
 * Real Waveform mount — pointer/mouse/touch tap seek on catalog hit target.
 * Desktop 1280×800 (mouse) · mobile 390×844 (touchscreen.tap, hasTouch context).
 * No audio. Network aborted in host.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeCatalogWaveformMountHost,
  probeCatalogWaveformSeekPointerAt,
} from "@/components/player/catalog-waveform-seek-target.mount-host";

describe("catalog waveform seek — pointer tap (real mount)", () => {
  afterAll(async () => {
    await closeCatalogWaveformMountHost();
  });

  it("desktop 1280×800: initial 35%, tap ~90% width updates a11y + seek callback", async () => {
    const p = await probeCatalogWaveformSeekPointerAt({
      width: 1280,
      height: 800,
    });
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.sliderVisible).toBe(true);
    expect(p.inputMethod).toBe("mouse");
    expect(p.passInitialA11y, JSON.stringify(p)).toBe(true);
    expect(p.passTapSeek, JSON.stringify(p)).toBe(true);
    expect(p.passNoAudioOrNetwork).toBe(true);
  }, 90_000);

  it("mobile 390×844: touchscreen tap seek without audio egress", async () => {
    const p = await probeCatalogWaveformSeekPointerAt({
      width: 390,
      height: 844,
      hasTouch: true,
    });
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.sliderVisible).toBe(true);
    expect(p.inputMethod).toBe("touchscreen");
    expect(p.passInitialA11y, JSON.stringify(p)).toBe(true);
    expect(p.passTapSeek, JSON.stringify(p)).toBe(true);
    expect(p.passNoAudioOrNetwork).toBe(true);
  }, 90_000);
});
