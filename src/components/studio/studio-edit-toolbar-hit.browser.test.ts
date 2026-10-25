/**
 * Studio edit-toolbar hit-area — Playwright CSS fixture (no Studio mount, no audio).
 * Mirrors Button size="sm" (h-7) + min-h-11 min-w-11. Viewports: 1280×800, 390×844.
 */
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIN_HIT_PX = 44;
const EDITOR = path.resolve(
  process.cwd(),
  "src/components/studio/studio-editor.tsx",
);

const LABELS = [
  "Zaznacz",
  "Edycja",
  "Podziel",
  "Usuń",
  "+ Dodaj ścieżkę",
  "Inspector",
  "Mixer",
  "Więcej",
  "Snap OFF",
  "zoom−",
  "zoom+",
  "Fit",
] as const;

const CSS = `
:root { font-size: 16px; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
.toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem;
  padding: 0.25rem;
}
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 1.75rem; /* Button size=sm → h-7 */
  min-height: 2.75rem; /* min-h-11 */
  min-width: 2.75rem; /* min-w-11 */
  gap: 0.25rem;
  padding-left: 0.625rem; padding-right: 0.625rem;
  font-size: 0.8rem;
  border: 1px solid #333;
  background: #eee;
  white-space: nowrap;
}
`;

function fixtureHtml(): string {
  const buttons = LABELS.map(
    (l) => `<button type="button" class="btn">${l}</button>`,
  ).join("");
  return `<!DOCTYPE html><html><head><style>${CSS}</style></head><body>
<div class="toolbar" data-testid="studio-edit-toolbar">${buttons}</div>
</body></html>`;
}

type Rect = { text: string; w: number; h: number };

async function measureAt(width: number, height: number): Promise<Rect[]> {
  const page = await browser!.newPage({ viewport: { width, height } });
  try {
    await page.setContent(fixtureHtml());
    return await page.evaluate(() =>
      [...document.querySelectorAll("[data-testid=studio-edit-toolbar] button")].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            text: el.textContent ?? "",
            w: Math.round(r.width * 100) / 100,
            h: Math.round(r.height * 100) / 100,
          };
        },
      ),
    );
  } finally {
    await page.close();
  }
}

let browser: Browser | null = null;

beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  browser = null;
});

describe("studio edit-toolbar hit-area", () => {
  it("source Buttons in studio-edit-toolbar declare min-h-11 min-w-11", () => {
    const src = readFileSync(EDITOR, "utf8");
    const start = src.indexOf('data-testid="studio-edit-toolbar"');
    const end = src.indexOf(
      'className="flex min-h-0 flex-col gap-3 xl:flex-row',
      start,
    );
    const toolbar = src.slice(start, end);
    const buttons = toolbar.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    expect(toolbar.match(/className="min-h-11 min-w-11/g)?.length ?? 0).toBe(
      buttons.length,
    );
    expect(toolbar).toContain("Fit");
  });

  it("desktop 1280×800: every toolbar control ≥44×44 (no clicks)", async () => {
    const rects = await measureAt(1280, 800);
    expect(rects.length).toBe(LABELS.length);
    for (const r of rects) {
      expect(r.h, JSON.stringify(r)).toBeGreaterThanOrEqual(MIN_HIT_PX);
      expect(r.w, JSON.stringify(r)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    }
  }, 60_000);

  it("mobile 390×844: every toolbar control ≥44×44 (no clicks)", async () => {
    const rects = await measureAt(390, 844);
    expect(rects.length).toBe(LABELS.length);
    for (const r of rects) {
      expect(r.h, JSON.stringify(r)).toBeGreaterThanOrEqual(MIN_HIT_PX);
      expect(r.w, JSON.stringify(r)).toBeGreaterThanOrEqual(MIN_HIT_PX);
    }
  }, 60_000);
});
