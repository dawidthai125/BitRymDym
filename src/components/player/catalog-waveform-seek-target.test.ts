/**
 * Catalog/home seek hit-area contract (source).
 * Visual bars use caller heightClassName or preset; interactive catalog hit is min-h-11 (≥44px).
 * Sticky contract unchanged; studio density out of scope.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CATALOG_SEEK_HIT_CLASS,
  STICKY_SEEK_HIT_CLASS,
  STICKY_SEEK_VISUAL_CLASS,
} from "@/components/brand/waveform";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("catalog waveform seek target (source)", () => {
  it("exports catalog hit ≥44px (min-h-11), aligned with sticky outer hit", () => {
    expect(CATALOG_SEEK_HIT_CLASS).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
    expect(CATALOG_SEEK_HIT_CLASS).not.toMatch(/(?:^|\s)h-5(?:\s|$)/);
    expect(CATALOG_SEEK_HIT_CLASS).toBe(STICKY_SEEK_HIT_CLASS);
  });

  it("Waveform applies catalog hit for density catalog + interactive", () => {
    const src = readSrc("src/components/brand/waveform.tsx");
    expect(src).toContain('density === "catalog" && interactive');
    expect(src).toContain("CATALOG_SEEK_HIT_CLASS");
    expect(src).toContain('data-seek-hit={');
    expect(src).toContain('"catalog"');
    // Sticky path unchanged: still gated by !heightClassName.
    expect(src).toContain('density === "sticky" && interactive && !heightClassName');
    expect(src).toContain("STICKY_SEEK_VISUAL_CLASS");
    expect(STICKY_SEEK_VISUAL_CLASS).toBe("h-5");
  });

  it("interactive Waveform exposes slider a11y and full APG keyboard seek", () => {
    const src = readSrc("src/components/brand/waveform.tsx");
    expect(src).toMatch(/role=\{interactive \? "slider" : "img"\}/);
    expect(src).toContain('const ariaLabel = ariaLabelProp ?? "Przebieg audio"');
    expect(src).toContain("aria-valuemin={interactive ? 0 : undefined}");
    expect(src).toContain("aria-valuemax={interactive ? 100 : undefined}");
    expect(src).toContain("Math.round(clamped * 100)");
    expect(src).toContain("aria-valuetext");
    expect(src).toContain('aria-orientation={interactive ? "horizontal" : undefined}');
    expect(src).toContain("tabIndex={interactive ? 0 : undefined}");
    expect(src).toContain('case "ArrowRight"');
    expect(src).toContain('case "ArrowUp"');
    expect(src).toContain("SEEK_KEYBOARD_STEP");
    expect(src).toContain('case "ArrowLeft"');
    expect(src).toContain('case "ArrowDown"');
    expect(src).toContain('case "Home"');
    expect(src).toContain('case "End"');
    expect(src).toContain("event.stopPropagation()");
  });

  it("catalog hit-wrap is not blocked by heightClassName", () => {
    const src = readSrc("src/components/brand/waveform.tsx");
    expect(src).toMatch(
      /const catalogSeekHit\s*=\s*density === "catalog" && interactive;/,
    );
    expect(src).not.toMatch(
      /catalogSeekHit[\s\S]{0,80}!heightClassName/,
    );
  });

  it("beat-catalog-row and home-beat-strip use density=catalog with interactive", () => {
    for (const rel of [
      "src/components/brand/beat-catalog-row.tsx",
      "src/components/brand/home-beat-strip.tsx",
    ]) {
      const src = readSrc(rel);
      expect(src, rel).toMatch(/density=["']catalog["']/);
      expect(src, rel).toMatch(/\binteractive\b/);
      expect(src, rel).toMatch(/heightClassName=/);
    }
  });
});
