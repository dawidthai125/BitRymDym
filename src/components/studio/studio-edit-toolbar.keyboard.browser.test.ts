/**
 * Real StudioEditToolbar — native Tab order and focus rings.
 * No menu action activation, no audio, network aborted in host.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeStudioToolbarMountHost,
  invalidateStudioToolbarMountBundle,
  probeStudioEditToolbarKeyboardAt,
} from "@/components/studio/studio-edit-toolbar.mount-host";

describe("studio edit-toolbar — keyboard a11y (real mount)", () => {
  afterAll(async () => {
    await closeStudioToolbarMountHost();
  });

  for (const [name, width, height] of [["desktop", 1280, 800], ["mobile", 390, 844]] as const) {
    it(`${name} ${width}×${height}: Tab order named + focus-visible, no menu of its own; no audio/network/actions`, async () => {
      invalidateStudioToolbarMountBundle();
      const p = await probeStudioEditToolbarKeyboardAt({ width, height });
      expect(p.mounted, JSON.stringify(p)).toBe(true);
      expect(p.usedRealButtonAttr).toBe(true);
      expect(p.audioElementCount).toBe(0);
      expect(p.activatedForbiddenAction).toBe(false);
      expect(p.networkAllowedNonLocal).toBe(0);
      expect(p.tabStops.length).toBeGreaterThanOrEqual(5);
      expect(p.allStopsNamed, JSON.stringify(p.tabStops)).toBe(true);
      expect(p.allStopsFocusVisible, JSON.stringify(p.tabStops)).toBe(true);
      // Everything else lives in the five groups now.
      expect(p.moreButtonPresent).toBe(false);
      expect(p.tabStops.some((s) => s.label === "CAŁOŚĆ" || s.label === "Dopasuj oś czasu do szerokości")).toBe(true);
    }, 90_000);
  }
});
