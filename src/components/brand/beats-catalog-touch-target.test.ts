import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Beats catalog chrome touch targets â€” mobile Filtry / Sort / sheet Zamknij
 * were min-h-10 (40px); project CTA standard is min-h-11 (â‰Ą44px), same as
 * header-search-touch-target.test.ts.
 */
describe("beats catalog filter/sort touch targets", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/brand/beats-catalog-client.tsx"),
    "utf8",
  );

  it("Filtry, SortSelect, and sheet Zamknij use min-h-11 (no min-h-10)", () => {
    const filtryBtn = src.match(/<button[\s\S]*?>[\s\S]*?Filtry/);
    expect(filtryBtn?.[0]).toMatch(/(?:^|\s|")min-h-11(?:\s|"|$)/);

    const sortSelect = src.match(/function SortSelect[\s\S]*?<\/select>/);
    expect(sortSelect?.[0]).toMatch(/(?:^|\s|")min-h-11(?:\s|"|$)/);

    const zamknijBtn = src.match(/<button[\s\S]*?>\s*Zamknij\s*</);
    expect(zamknijBtn?.[0]).toMatch(/(?:^|\s|")min-h-11(?:\s|"|$)/);

    expect(src).not.toMatch(/(?:^|\s|")min-h-10(?:\s|"|$)/);
  });

  it("mobile Filtry sheet uses shared modal focus trap + restore trigger", () => {
    expect(src).toMatch(/attachModalFocusTrap/);
    expect(src).toMatch(/filtersTriggerRef/);
    expect(src).toMatch(/filtersPanelRef/);
    expect(src).toMatch(/closeFiltersSheet/);
    expect(src).toMatch(/filtersTriggerRef\.current\?\.focus\(\)/);
    expect(src).toMatch(/aria-expanded=\{filtersOpen\}/);
    expect(src).toMatch(/aria-haspopup="dialog"/);
    expect(src).toMatch(/aria-controls=\{filtersDialogId\}/);
    expect(src).toMatch(/tabIndex=\{-1\}/);
  });
});
