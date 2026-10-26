/**
 * Real StudioEditToolbar React mount — bbox ≥44×44 (desktop + mobile).
 * No control clicks, no audio, no Supabase. Network blocked in host.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  closeStudioToolbarMountHost,
  measureStudioEditToolbarAt,
} from "@/components/studio/studio-edit-toolbar.mount-host";

const MIN_HIT_PX = 44;
const TOOLBAR_SRC = path.resolve(
  process.cwd(),
  "src/components/studio/studio-edit-toolbar.tsx",
);

describe("studio edit-toolbar — real component mount hit-area", () => {
  afterAll(async () => {
    await closeStudioToolbarMountHost();
  });

  it("source StudioEditToolbar Buttons declare min-h-11 min-w-11", () => {
    const src = readFileSync(TOOLBAR_SRC, "utf8");
    expect(src).toMatch(/data-testid="studio-edit-toolbar"/);
    const buttons = src.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    expect(src.match(/className="min-h-11 min-w-11/g)?.length ?? 0).toBe(
      buttons.length,
    );
  });

  it("desktop 1280×800: real mount controls ≥44×44, Fit≥44, no overlap, no audio", async () => {
    const m = await measureStudioEditToolbarAt({ width: 1280, height: 800 });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.usedRealButtonAttr, "expects data-slot=button from ui/Button").toBe(
      true,
    );
    expect(m.audioElementCount).toBe(0);
    expect(m.controls.length).toBeGreaterThanOrEqual(10);
    expect(m.overlaps, JSON.stringify(m.overlaps)).toEqual([]);
    for (const c of m.controls) {
      expect(c.height, JSON.stringify(c)).toBeGreaterThanOrEqual(MIN_HIT_PX);
      expect(c.width, JSON.stringify(c)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    }
    expect(m.fit, "Fit control present").toBeTruthy();
    expect(m.fit!.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.upgrade, "Zmień pakiet CTA present").toBeTruthy();
    expect(m.upgrade!.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
  }, 90_000);

  it("mobile 390×844: real mount controls ≥44×44, Fit≥44, no overlap, no audio", async () => {
    const m = await measureStudioEditToolbarAt({ width: 390, height: 844 });
    expect(m.mounted, JSON.stringify(m)).toBe(true);
    expect(m.usedRealButtonAttr).toBe(true);
    expect(m.audioElementCount).toBe(0);
    expect(m.controls.length).toBeGreaterThanOrEqual(10);
    expect(m.overlaps, JSON.stringify(m.overlaps)).toEqual([]);
    for (const c of m.controls) {
      expect(c.height, JSON.stringify(c)).toBeGreaterThanOrEqual(MIN_HIT_PX);
      expect(c.width, JSON.stringify(c)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    }
    expect(m.fit).toBeTruthy();
    expect(m.fit!.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
  }, 90_000);
});
