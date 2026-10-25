/**
 * Node host: esbuild IIFE + Playwright Chromium for StickyMiniPlayer mount.
 * Pattern mirrors studio-fx-parity-oac-host (local-only, no network / Supabase).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "sticky-mini-player.mount-entry.tsx");
const STUBS = path.join(HERE, "sticky-mini-player.mount-stubs.tsx");
const CSS_PATH = path.join(HERE, "sticky-mini-player.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export function getStickyMountCss(): string {
  if (!cssCache) {
    cssCache = readFileSync(CSS_PATH, "utf8");
  }
  return cssCache;
}

export async function getStickyMountBundle(): Promise<string> {
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
      "@/components/player/player-provider": STUBS,
    },
    plugins: [
      {
        name: "sticky-mount-next-stubs",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "sticky-mount:next-link",
            namespace: "sticky-mount",
          }));
          build.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "sticky-mount:next-navigation",
            namespace: "sticky-mount",
          }));
          build.onResolve({ filter: /^next\/image$/ }, () => ({
            path: "sticky-mount:next-image",
            namespace: "sticky-mount",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "sticky-mount" },
            (args) => {
              if (args.path === "sticky-mount:next-link") {
                return {
                  contents: `
                    import { NextLink } from ${JSON.stringify(STUBS)};
                    export default NextLink;
                  `,
                  loader: "tsx",
                  resolveDir: HERE,
                };
              }
              if (args.path === "sticky-mount:next-navigation") {
                return {
                  contents: `
                    export { usePathname } from ${JSON.stringify(STUBS)};
                  `,
                  loader: "tsx",
                  resolveDir: HERE,
                };
              }
              if (args.path === "sticky-mount:next-image") {
                return {
                  contents: `
                    export { default } from ${JSON.stringify(STUBS)};
                  `,
                  loader: "tsx",
                  resolveDir: HERE,
                };
              }
              return undefined;
            },
          );
        },
      },
    ],
  });

  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error("esbuild produced empty StickyMiniPlayer mount bundle");
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

export async function closeStickyMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export type StickyMountRects = {
  mounted: boolean;
  hasSeekHitAttr: boolean;
  seek: { width: number; height: number; left: number; right: number; top: number; bottom: number };
  visual: { height: number };
  play: { width: number; height: number; left: number; right: number; top: number; bottom: number };
  close: { left: number; right: number; top: number; bottom: number };
  overlapPlay: boolean;
  overlapClose: boolean;
  audioElementCount: number;
};

function overlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

export async function measureStickyMiniPlayerAt(viewport: {
  width: number;
  height: number;
}): Promise<StickyMountRects> {
  const bundle = await getStickyMountBundle();
  const css = getStickyMountCss();
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport });

  try {
    // Block remote network — local setContent + injected script only.
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
      await route.abort();
    });

    await page.setContent(
      `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"/><style>${css}</style></head><body><div id="sticky-mount-root"></div></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const api = window.__BRD_STICKY_MOUNT__;
      if (!api) throw new Error("__BRD_STICKY_MOUNT__ missing");
      api.mount("sticky-mount-root");
    });
    await page.waitForSelector('[data-seek-hit="sticky"]', { timeout: 10_000 });

    const measured = await page.evaluate(() => {
      const region = document.querySelector('[aria-label="Odtwarzacz"]');
      const seek = document.querySelector(
        '[data-seek-hit="sticky"]',
      ) as HTMLElement | null;
      const play = document.querySelector(
        'button[aria-pressed]',
      ) as HTMLElement | null;
      const close = document.querySelector(
        'button[aria-label="Zamknij odtwarzacz"]',
      ) as HTMLElement | null;
      if (!region || !seek || !play || !close) {
        return {
          mounted: false,
          hasSeekHitAttr: Boolean(seek),
          seek: { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 },
          visual: { height: 0 },
          play: { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 },
          close: { left: 0, right: 0, top: 0, bottom: 0 },
          audioElementCount: document.querySelectorAll("audio").length,
        };
      }
      const visual =
        (seek.querySelector(".h-5") as HTMLElement | null) ??
        (seek.firstElementChild as HTMLElement | null);
      const sr = seek.getBoundingClientRect();
      const vr = visual?.getBoundingClientRect();
      const pr = play.getBoundingClientRect();
      const cr = close.getBoundingClientRect();
      return {
        mounted: true,
        hasSeekHitAttr: seek.getAttribute("data-seek-hit") === "sticky",
        seek: {
          width: sr.width,
          height: sr.height,
          left: sr.left,
          right: sr.right,
          top: sr.top,
          bottom: sr.bottom,
        },
        visual: { height: vr?.height ?? 0 },
        play: {
          width: pr.width,
          height: pr.height,
          left: pr.left,
          right: pr.right,
          top: pr.top,
          bottom: pr.bottom,
        },
        close: {
          left: cr.left,
          right: cr.right,
          top: cr.top,
          bottom: cr.bottom,
        },
        audioElementCount: document.querySelectorAll("audio").length,
      };
    });

    return {
      ...measured,
      overlapPlay: measured.mounted
        ? overlap(measured.seek, measured.play)
        : true,
      overlapClose: measured.mounted
        ? overlap(measured.seek, measured.close)
        : true,
    };
  } finally {
    await page.close();
  }
}

/** Expose Page type for rare extensions — unused by default. */
export type StickyMountPage = Page;
