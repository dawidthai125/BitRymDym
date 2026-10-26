/**
 * Real BeatsCatalogClient — search/filter result count live region (role=status).
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeBeatsFiltersMountHost,
  invalidateBeatsFiltersMountBundle,
  probeBeatsCatalogBpmFilterStatus,
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
    expect(p.initialStatusText, JSON.stringify(p)).toBe("2 bity");
    expect(p.initialInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.emptyStatusText, JSON.stringify(p)).toBe(
      "Cicho. Brak bitów dla tych filtrów.",
    );
    expect(p.emptyInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.restoredStatusText, JSON.stringify(p)).toBe("2 bity");
    expect(p.restoredInAxTree, JSON.stringify(p)).toBe(true);
  }, 90_000);

  it("Filtry→BPM max 129→Pokaż wyniki: live status 1 bit · z 2; inert restored", async () => {
    invalidateBeatsFiltersMountBundle();
    const p = await probeBeatsCatalogBpmFilterStatus();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.audioElementCount).toBe(0);
    expect(p.networkNonLocal).toBe(0);
    expect(p.initialStatusText, JSON.stringify(p)).toBe("2 bity");
    expect(p.initialInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.backgroundInertWhileOpen, JSON.stringify(p)).toBe(true);
    expect(p.shellInertWhileOpen, JSON.stringify(p)).toBe(true);
    expect(p.showResultsLabelIncludesOne, JSON.stringify(p)).toBe(true);
    expect(p.dialogClosedAfterApply, JSON.stringify(p)).toBe(true);
    expect(p.backgroundInertAfterClose, JSON.stringify(p)).toBe(false);
    expect(p.shellInertAfterClose, JSON.stringify(p)).toBe(false);
    expect(p.statusInertAncestor, JSON.stringify(p)).toBe(false);
    expect(p.statusCount, JSON.stringify(p)).toBe(1);
    expect(p.finalStatusText, JSON.stringify(p)).toBe("1 bit · z 2");
    expect(p.finalInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.metaAriaHiddenPresent, JSON.stringify(p)).toBe(true);
    expect(p.metaVisibleText, JSON.stringify(p)).toMatch(/1 bit · z 2/);
  }, 90_000);
});
