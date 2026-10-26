/**
 * Node host: esbuild IIFE + Playwright Chromium for Waveform catalog/sticky mount.
 * Pattern mirrors sticky-mini-player.mount-host (local-only, no network).
 *
 * Excluded from production tsconfig (playwright is a devDependency).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "catalog-waveform-seek-target.mount-entry.tsx");
const CSS_PATH = path.join(HERE, "catalog-waveform-seek-target.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");
const MOUNT_ROOT_ID = "catalog-waveform-mount-root";

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export function getCatalogWaveformMountCss(): string {
  if (!cssCache) {
    cssCache = readFileSync(CSS_PATH, "utf8");
  }
  return cssCache;
}

export async function getCatalogWaveformMountBundle(): Promise<string> {
  if (bundleCache) return bundleCache;

  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    jsx: "automatic",
    sourcemap: false,
    logLevel: "silent",
    alias: {
      "@": SRC_ROOT,
    },
  });

  const text = result.outputFiles?.[0]?.text;
  if (!text) {
    throw new Error("esbuild produced empty catalog Waveform mount bundle");
  }
  bundleCache = text;
  return text;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
  }
  return browserPromise;
}

export async function closeCatalogWaveformMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export type CatalogWaveformMountRects = {
  mounted: boolean;
  hasSeekHitAttr: boolean;
  seekHitValue: string | null;
  seek: {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  visual: { height: number };
  audioElementCount: number;
  networkNonLocal: number;
  seekCallbackWired: false;
};

export async function measureCatalogWaveformAt(viewport: {
  width: number;
  height: number;
  heightClassName?: string;
  density?: "catalog" | "sticky";
}): Promise<CatalogWaveformMountRects> {
  const bundle = await getCatalogWaveformMountBundle();
  const css = getCatalogWaveformMountCss();
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });

  const density = viewport.density ?? "catalog";
  const expectedSeekHit = density === "sticky" ? "sticky" : "catalog";
  let networkNonLocal = 0;

  try {
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (
        url.startsWith("data:") ||
        url === "about:blank" ||
        url.startsWith("blob:")
      ) {
        await route.continue();
        return;
      }
      networkNonLocal += 1;
      await route.abort();
    });

    await page.setContent(
      `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"/><style>${css}</style></head><body><div id="${MOUNT_ROOT_ID}" class="w-full"></div></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      ({ mountOpts, hostId }) => {
        const api = window.__BRD_CATALOG_WAVEFORM_MOUNT__;
        if (!api) throw new Error("__BRD_CATALOG_WAVEFORM_MOUNT__ missing");
        api.mount(mountOpts, hostId);
      },
      {
        mountOpts: {
          density,
          ...(viewport.heightClassName
            ? { heightClassName: viewport.heightClassName }
            : {}),
        },
        hostId: MOUNT_ROOT_ID,
      },
    );

    await page.waitForSelector(`[data-seek-hit="${expectedSeekHit}"]`, {
      timeout: 10_000,
    });

    const measured = await page.evaluate((expected) => {
      const seek = document.querySelector(
        `[data-seek-hit="${expected}"]`,
      ) as HTMLElement | null;
      if (!seek) {
        return {
          mounted: false,
          hasSeekHitAttr: false,
          seekHitValue: null as string | null,
          seek: {
            width: 0,
            height: 0,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          },
          visual: { height: 0 },
          audioElementCount: document.querySelectorAll("audio").length,
        };
      }
      const visual =
        (seek.querySelector(".h-5, .h-6, .h-7, .h-8") as HTMLElement | null) ??
        (seek.firstElementChild as HTMLElement | null);
      const sr = seek.getBoundingClientRect();
      const vr = visual?.getBoundingClientRect();
      return {
        mounted: true,
        hasSeekHitAttr: seek.getAttribute("data-seek-hit") === expected,
        seekHitValue: seek.getAttribute("data-seek-hit"),
        seek: {
          width: sr.width,
          height: sr.height,
          left: sr.left,
          right: sr.right,
          top: sr.top,
          bottom: sr.bottom,
        },
        visual: { height: vr?.height ?? 0 },
        audioElementCount: document.querySelectorAll("audio").length,
      };
    }, expectedSeekHit);

    return {
      ...measured,
      networkNonLocal,
      seekCallbackWired: false,
    };
  } finally {
    await page.close();
  }
}
