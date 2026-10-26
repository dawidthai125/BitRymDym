/**
 * Real StudioEditToolbar — native Tab / Enter / Escape for Więcej disclosure.
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

  it("desktop 1280×800: Tab order named + focus-visible; Więcej hidden; no audio/network/actions", async () => {
    invalidateStudioToolbarMountBundle();
    const p = await probeStudioEditToolbarKeyboardAt({
      width: 1280,
      height: 800,
    });
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.usedRealButtonAttr).toBe(true);
    expect(p.audioElementCount).toBe(0);
    expect(p.activatedForbiddenAction).toBe(false);
    expect(p.networkAllowedNonLocal).toBe(0);
    expect(p.tabStops.length).toBeGreaterThanOrEqual(8);
    expect(p.allStopsNamed, JSON.stringify(p.tabStops)).toBe(true);
    expect(p.allStopsFocusVisible, JSON.stringify(p.tabStops)).toBe(true);
    expect(p.moreButtonPresent).toBe(false);
    expect(p.moreOpenViaEnter).toBeNull();
    expect(p.tabStops.some((s) => s.label === "Więcej")).toBe(false);
    expect(p.tabStops.some((s) => s.label === "Fit")).toBe(true);
    expect(p.tabStops.some((s) => s.label === "Zmień pakiet")).toBe(true);
  }, 90_000);

  it("mobile 390×844: Tab→Więcej Enter opens disclosure; Escape closes; names + focus-visible", async () => {
    invalidateStudioToolbarMountBundle();
    const p = await probeStudioEditToolbarKeyboardAt({
      width: 390,
      height: 844,
    });
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.usedRealButtonAttr).toBe(true);
    expect(p.audioElementCount).toBe(0);
    expect(p.activatedForbiddenAction).toBe(false);
    expect(p.networkAllowedNonLocal).toBe(0);
    expect(p.tabStops.length).toBeGreaterThanOrEqual(6);
    expect(p.allStopsNamed, JSON.stringify(p.tabStops)).toBe(true);
    expect(p.allStopsFocusVisible, JSON.stringify(p.tabStops)).toBe(true);
    expect(p.moreButtonPresent).toBe(true);
    expect(p.tabStops.some((s) => s.label === "Więcej")).toBe(true);

    expect(p.moreOpenViaEnter, JSON.stringify(p)).toBeTruthy();
    expect(p.moreOpenViaEnter!.ariaExpanded).toBe("true");
    expect(p.moreOpenViaEnter!.overflowHiddenClass).toBe(false);
    expect(p.moreOpenViaEnter!.overflowDisplay).not.toBe("none");

    expect(p.moreAfterEscape, JSON.stringify(p)).toBeTruthy();
    expect(p.moreAfterEscape!.ariaExpanded).toBe("false");
    expect(p.moreAfterEscape!.overflowHiddenClass).toBe(true);
    expect(p.moreAfterEscape!.overflowDisplay).toBe("none");
    expect(p.moreAfterEscape!.focusBackOnMore).toBe(true);
  }, 90_000);
});
