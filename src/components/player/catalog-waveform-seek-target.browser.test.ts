/**
 * Catalog seek hit-area — real bounding boxes (no Play, no audio).
 * Fixture mirrors mobile catalog row waveform row; CSS mirrors Tailwind min-h-11 / h-6.
 * Viewport: mobile 390×844.
 */
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CATALOG_SEEK_HIT_CLASS } from "@/components/brand/waveform";

const MIN_HIT_PX = 44;
const VISUAL_H_PX = 24; // Tailwind h-6 @ 16px root

function assertCatalogClassContract(): void {
  expect(CATALOG_SEEK_HIT_CLASS).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
}

type Measure = {
  seek: { width: number; height: number; left: number; right: number; top: number; bottom: number };
  visual: { height: number };
  play: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  overlapPlay: boolean;
};

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<style>
  :root { font-size: 16px; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem 0.625rem;
    padding-left: calc(3.5rem + 0.75rem);
    width: 100%;
  }
  .play {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid #333;
    background: #eee;
  }
  .wave-col {
    flex: 1;
    min-width: 0;
  }
  /* Mirrors CATALOG_SEEK_HIT_CLASS / h-6 inner visual (Tailwind) */
  .seek-hit {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 2.75rem; /* min-h-11 */
    user-select: none;
    touch-action: none;
    background: transparent;
  }
  .seek-visual {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 1.5rem; /* h-6 */
    gap: 1px;
    background: #ddd;
  }
  .seek-visual span {
    flex: 1;
    min-width: 1px;
    align-self: center;
    height: 70%;
    background: #666;
  }
</style>
</head>
<body>
  <div class="row" role="listitem">
    <div class="wave-col">
      <div
        class="seek-hit"
        id="seek"
        role="slider"
        aria-label="Przebieg: fixture bit"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="0"
        data-seek-hit="catalog"
        tabindex="0"
      >
        <div class="seek-visual" id="visual" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </div>
    </div>
    <button type="button" class="play" id="play" aria-label="Odtwórz"></button>
  </div>
</body>
</html>`;

describe("catalog waveform seek target (fixture CSS bbox — not React mount)", () => {
  let browser: Browser;

  beforeAll(async () => {
    assertCatalogClassContract();
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function measureAt(width: number, height: number): Promise<Measure> {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.setContent(FIXTURE_HTML, { waitUntil: "domcontentloaded" });
      return await page.evaluate(() => {
        const seek = document.getElementById("seek")!.getBoundingClientRect();
        const visual = document.getElementById("visual")!.getBoundingClientRect();
        const play = document.getElementById("play")!.getBoundingClientRect();
        const s = {
          left: seek.left,
          right: seek.right,
          top: seek.top,
          bottom: seek.bottom,
        };
        const p = {
          left: play.left,
          right: play.right,
          top: play.top,
          bottom: play.bottom,
        };
        const overlap = (
          a: typeof s,
          b: typeof p,
        ) =>
          !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        return {
          seek: {
            width: seek.width,
            height: seek.height,
            left: seek.left,
            right: seek.right,
            top: seek.top,
            bottom: seek.bottom,
          },
          visual: { height: visual.height },
          play: {
            left: play.left,
            right: play.right,
            top: play.top,
            bottom: play.bottom,
            width: play.width,
            height: play.height,
          },
          overlapPlay: overlap(s, p),
        };
      });
    } finally {
      await page.close();
    }
  }

  it("mobile 390×844: seek hit ≥44×44, visual ~24px (h-6), no overlap Play", async () => {
    const m = await measureAt(390, 844);
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(VISUAL_H_PX);
    expect(m.play.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.play.height).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.overlapPlay).toBe(false);
    expect(rectsOverlap(m.seek, m.play)).toBe(false);
  });
});
