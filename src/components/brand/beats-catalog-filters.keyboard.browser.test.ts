/**
 * Real BeatsCatalogClient — native Tab/Shift+Tab trap + Escape for Filtry sheet.
 * No filter chip activation, no Play, network aborted in host.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeBeatsFiltersMountHost,
  invalidateBeatsFiltersMountBundle,
  probeBeatsFiltersKeyboard,
} from "@/components/brand/beats-catalog-filters.mount-host";

describe("beats catalog Filtry — keyboard focus trap (real mount)", () => {
  afterAll(async () => {
    await closeBeatsFiltersMountHost();
  });

  it("mobile 390×844: open moves focus in dialog; Tab wraps; Escape restores Filtry", async () => {
    invalidateBeatsFiltersMountBundle();
    const p = await probeBeatsFiltersKeyboard();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.audioElementCount).toBe(0);
    expect(p.networkNonLocal).toBe(0);
    expect(p.afterOpenInsideDialog, JSON.stringify(p)).toBe(true);
    expect(p.tabForwardEscaped, JSON.stringify(p)).toBe(false);
    expect(p.tabBackwardEscaped, JSON.stringify(p)).toBe(false);
    expect(p.uniqueInDialogForward.length).toBeGreaterThan(0);
    expect(p.escapeClosed).toBe(true);
    expect(p.focusBackOnFiltry).toBe(true);
  }, 90_000);
});
