/**
 * Real BeatsCatalogClient — search/filter result count live region (role=status).
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeBeatsFiltersMountHost,
  invalidateBeatsFiltersMountBundle,
  probeBeatsCatalogResultStatus,
} from "@/components/brand/beats-catalog-filters.mount-host";

describe("beats catalog — result status live region (real mount)", () => {
  afterAll(async () => {
    await closeBeatsFiltersMountHost();
  });

  it("initial count; search→0 empty copy; clear→restored; no audio/network", async () => {
    invalidateBeatsFiltersMountBundle();
    const p = await probeBeatsCatalogResultStatus();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.audioElementCount).toBe(0);
    expect(p.networkNonLocal).toBe(0);
    expect(p.initialStatusText, JSON.stringify(p)).toBe("2 bitów");
    expect(p.initialInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.emptyStatusText, JSON.stringify(p)).toBe(
      "Cicho. Brak bitów dla tych filtrów.",
    );
    expect(p.emptyInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.restoredStatusText, JSON.stringify(p)).toBe("2 bitów");
    expect(p.restoredInAxTree, JSON.stringify(p)).toBe(true);
  }, 90_000);
});
