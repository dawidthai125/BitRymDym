/**
 * Sticky seek hit-area — real bounding boxes (no Play, no audio).
 * Fixture mirrors public sticky rail layout; CSS mirrors Tailwind min-h-11 / h-5.
 * Viewports: desktop 1280×800, mobile 390×844.
 */
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  STICKY_SEEK_HIT_CLASS,
  STICKY_SEEK_VISUAL_CLASS,
} from "@/components/brand/waveform";

const MIN_HIT_PX = 44;
const VISUAL_H_PX = 20; // Tailwind h-5 @ 16px root

function assertStickyClassContract(): void {
  expect(STICKY_SEEK_HIT_CLASS).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
  expect(STICKY_SEEK_VISUAL_CLASS).toBe("h-5");
}

type Measure = {
  seek: { width: number; height: number; left: number; right: number; top: number; bottom: number };
  visual: { height: number };
  play: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  close: { left: number; right: number; top: number; bottom: number };
  overlapPlay: boolean;
  overlapClose: boolean;
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
  .rail {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    width: 100%;
    border-top: 1px solid #ccc;
  }
  .play {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid #333;
    background: #eee;
  }
  .mid {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title { font-size: 0.875rem; font-weight: 600; margin: 0; }
  /* Mirrors STICKY_SEEK_HIT_CLASS / STICKY_SEEK_VISUAL_CLASS (Tailwind) */
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
    height: 1.25rem; /* h-5 */
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
  .close {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border: 0;
    background: transparent;
  }
</style>
</head>
<body>
  <div class="rail" role="region" aria-label="Odtwarzacz">
    <button type="button" class="play" id="play" aria-label="Odtwórz"></button>
    <div class="mid">
      <p class="title">Fixture bit</p>
      <div
        class="seek-hit"
        id="seek"
        role="slider"
        aria-label="Przebieg — przewiń bit"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="0"
        data-seek-hit="sticky"
        tabindex="0"
      >
        <div class="seek-visual" id="visual" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </div>
    </div>
    <button type="button" class="close" id="close" aria-label="Zamknij odtwarzacz">✕</button>
  </div>
</body>
</html>`;

describe("sticky waveform seek target (browser bbox)", () => {
  let browser: Browser;

  beforeAll(async () => {
    assertStickyClassContract();
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
        const close = document.getElementById("close")!.getBoundingClientRect();
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
        const c = {
          left: close.left,
          right: close.right,
          top: close.top,
          bottom: close.bottom,
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
          close: {
            left: close.left,
            right: close.right,
            top: close.top,
            bottom: close.bottom,
          },
          overlapPlay: overlap(s, p),
          overlapClose: overlap(s, c),
        };
      });
    } finally {
      await page.close();
    }
  }

  it("desktop 1280×800: seek hit ≥44×44, visual ~20px, no overlap Play/Close", async () => {
    const m = await measureAt(1280, 800);
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(VISUAL_H_PX);
    expect(m.play.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.play.height).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.overlapPlay).toBe(false);
    expect(m.overlapClose).toBe(false);
    expect(rectsOverlap(m.seek, m.play)).toBe(false);
  });

  it("mobile 390×844: seek hit ≥44×44, visual ~20px, no overlap Play/Close", async () => {
    const m = await measureAt(390, 844);
    expect(m.seek.height, JSON.stringify(m.seek)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(m.seek.width).toBeGreaterThanOrEqual(MIN_HIT_PX);
    expect(Math.round(m.visual.height)).toBe(VISUAL_H_PX);
    expect(m.overlapPlay).toBe(false);
    expect(m.overlapClose).toBe(false);
  });
});
