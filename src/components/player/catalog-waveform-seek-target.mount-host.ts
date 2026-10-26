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

/** Clears esbuild bundle cache so mount-entry changes are picked up without closing the browser. */
export function invalidateCatalogWaveformMountBundle(): void {
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

const PRE_TAB_BUTTON_ID = "catalog-waveform-pre-tab";
const SLIDER_A11Y_NAME = "Przebieg: Mount Fixture";

export type CatalogWaveformSeekKeyboardProbe = {
  mounted: boolean;
  sliderVisible: boolean;
  ariaValuemin: string | null;
  ariaValuemax: string | null;
  initialAriaValuenow: string | null;
  tabIndex: string | null;
  tabFocusReachedSlider: boolean;
  afterArrowRight: {
    ariaValuenow: string | null;
    lastRatio: number | null;
    callsLength: number;
  };
  afterArrowLeft: {
    ariaValuenow: string | null;
    lastRatio: number | null;
  };
  audioElementCount: number;
  networkNonLocal: number;
  passInitialA11y: boolean;
  passTabFocus: boolean;
  passArrowRight: boolean;
  passArrowLeft: boolean;
  passNoAudioOrNetwork: boolean;
};

function ratioApprox(a: number | null, expected: number, eps = 0.001): boolean {
  if (a === null || Number.isNaN(a)) return false;
  return Math.abs(a - expected) <= eps;
}

/**
 * Real Waveform mount with seek callback — slider role, Tab focus, Arrow ±0.03.
 */
export async function probeCatalogWaveformSeekKeyboardA11yAt(viewport: {
  width: number;
  height: number;
}): Promise<CatalogWaveformSeekKeyboardProbe> {
  invalidateCatalogWaveformMountBundle();
  const bundle = await getCatalogWaveformMountBundle();
  const css = getCatalogWaveformMountCss();
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });

  let networkNonLocal = 0;

  const failProbe = (
    partial: Partial<CatalogWaveformSeekKeyboardProbe> = {},
  ): CatalogWaveformSeekKeyboardProbe => ({
    mounted: false,
    sliderVisible: false,
    ariaValuemin: null,
    ariaValuemax: null,
    initialAriaValuenow: null,
    tabIndex: null,
    tabFocusReachedSlider: false,
    afterArrowRight: {
      ariaValuenow: null,
      lastRatio: null,
      callsLength: 0,
    },
    afterArrowLeft: {
      ariaValuenow: null,
      lastRatio: null,
    },
    audioElementCount: 0,
    networkNonLocal,
    passInitialA11y: false,
    passTabFocus: false,
    passArrowRight: false,
    passArrowLeft: false,
    passNoAudioOrNetwork: false,
    ...partial,
  });

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
      `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"/><style>${css}</style></head><body><button type="button" id="${PRE_TAB_BUTTON_ID}">pre</button><div id="${MOUNT_ROOT_ID}" class="w-full"></div></body></html>`,
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
          density: "catalog" as const,
          wireSeekCallback: true,
        },
        hostId: MOUNT_ROOT_ID,
      },
    );

    await page.waitForSelector('[data-seek-hit="catalog"]', {
      timeout: 10_000,
    });

    const slider = page.getByRole("slider", { name: SLIDER_A11Y_NAME });
    const sliderVisible = await slider.isVisible().catch(() => false);
    if (!sliderVisible) {
      return failProbe({ networkNonLocal });
    }

    const initialAttrs = await slider.evaluate((el) => ({
      min: el.getAttribute("aria-valuemin"),
      max: el.getAttribute("aria-valuemax"),
      now: el.getAttribute("aria-valuenow"),
      tabIndex: el.getAttribute("tabindex"),
    }));

    await page.locator(`#${PRE_TAB_BUTTON_ID}`).focus();
    await page.keyboard.press("Tab");

    const tabFocusReachedSlider = await page.evaluate(
      ({ name }) => {
        const el = document.activeElement;
        return (
          el?.getAttribute("role") === "slider" &&
          el.getAttribute("aria-label") === name
        );
      },
      { name: SLIDER_A11Y_NAME },
    );

    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-seek-hit="catalog"]');
        return el?.getAttribute("aria-valuenow") === "38";
      },
      undefined,
      { timeout: 5_000 },
    );

    const afterArrowRight = await page.evaluate(() => {
      const el = document.querySelector('[data-seek-hit="catalog"]');
      const seek = window.__BRD_CATALOG_WAVEFORM_SEEK__;
      return {
        ariaValuenow: el?.getAttribute("aria-valuenow") ?? null,
        lastRatio: seek?.lastRatio ?? null,
        callsLength: seek?.calls?.length ?? 0,
      };
    });

    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-seek-hit="catalog"]');
        return el?.getAttribute("aria-valuenow") === "35";
      },
      undefined,
      { timeout: 5_000 },
    );

    const afterArrowLeft = await page.evaluate(() => {
      const el = document.querySelector('[data-seek-hit="catalog"]');
      const seek = window.__BRD_CATALOG_WAVEFORM_SEEK__;
      return {
        ariaValuenow: el?.getAttribute("aria-valuenow") ?? null,
        lastRatio: seek?.lastRatio ?? null,
      };
    });

    const audioElementCount = await page.evaluate(
      () => document.querySelectorAll("audio").length,
    );

    const passInitialA11y =
      initialAttrs.min === "0" &&
      initialAttrs.max === "100" &&
      initialAttrs.now === "35" &&
      initialAttrs.tabIndex === "0";

    const passArrowRight =
      afterArrowRight.ariaValuenow === "38" &&
      afterArrowRight.callsLength >= 1 &&
      ratioApprox(afterArrowRight.lastRatio, 0.38);

    const passArrowLeft =
      afterArrowLeft.ariaValuenow === "35" &&
      ratioApprox(afterArrowLeft.lastRatio, 0.35);

    const passNoAudioOrNetwork =
      audioElementCount === 0 && networkNonLocal === 0;

    return {
      mounted: true,
      sliderVisible: true,
      ariaValuemin: initialAttrs.min,
      ariaValuemax: initialAttrs.max,
      initialAriaValuenow: initialAttrs.now,
      tabIndex: initialAttrs.tabIndex,
      tabFocusReachedSlider,
      afterArrowRight,
      afterArrowLeft,
      audioElementCount,
      networkNonLocal,
      passInitialA11y,
      passTabFocus: tabFocusReachedSlider,
      passArrowRight,
      passArrowLeft,
      passNoAudioOrNetwork,
    };
  } catch {
    return failProbe({ networkNonLocal });
  } finally {
    await page.close();
  }
}
