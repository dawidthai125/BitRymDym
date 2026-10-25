/**
 * Sticky mini-player seek hit-area contract (source).
 * Visual bars stay h-5; interactive sticky hit target is min-h-11 (≥44px).
 * Studio density / StudioClipWaveform are out of scope.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STICKY_SEEK_HIT_CLASS,
  STICKY_SEEK_VISUAL_CLASS,
} from "@/components/brand/waveform";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("sticky waveform seek target (source)", () => {
  it("exports sticky hit ≥44px (min-h-11) with visual bars h-5", () => {
    expect(STICKY_SEEK_HIT_CLASS).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
    expect(STICKY_SEEK_HIT_CLASS).not.toMatch(/(?:^|\s)h-5(?:\s|$)/);
    expect(STICKY_SEEK_VISUAL_CLASS).toBe("h-5");
  });

  it("Waveform applies sticky hit only for density sticky + interactive", () => {
    const src = readSrc("src/components/brand/waveform.tsx");
    expect(src).toContain('density === "sticky" && interactive');
    expect(src).toContain("STICKY_SEEK_HIT_CLASS");
    expect(src).toContain("STICKY_SEEK_VISUAL_CLASS");
    expect(src).toContain('data-seek-hit={stickySeekHit ? "sticky"');
    // Studio preset height remains independent (no sticky hit wrap).
    expect(src).toMatch(/studio:\s*\{\s*bars:\s*72,\s*heightClassName:\s*"h-14/);
  });

  it("public StickyMiniPlayer is the only sticky+interactive Waveform caller", () => {
    const sticky = readSrc("src/components/player/sticky-mini-player.tsx");
    expect(sticky).toMatch(/density=["']sticky["']/);
    expect(sticky).toMatch(/\binteractive\b/);

    const brandWaveformImports = [
      "src/app/page.tsx",
      "src/components/brand/beat-catalog-row.tsx",
      "src/components/brand/brd-live-mic-waveform.tsx",
      "src/components/brand/brd-take-preview-rail.tsx",
      "src/components/brand/home-beat-strip.tsx",
      "src/components/player/playback-shell.tsx",
      "src/components/takes/recording-panel.tsx",
      "src/app/beat/[id]/beat-detail-client.tsx",
      "src/app/account/page.tsx",
    ];
    for (const rel of brandWaveformImports) {
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(/density=["']sticky["']/);
    }
  });
});
