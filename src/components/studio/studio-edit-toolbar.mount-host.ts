/**
 * Node host: esbuild IIFE + Playwright Chromium for StudioEditToolbar mount.
 * Excluded from production tsconfig (playwright is a devDependency).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "studio-edit-toolbar.mount-entry.tsx");
const STUBS = path.join(HERE, "studio-edit-toolbar.mount-stubs.tsx");
const CSS_PATH = path.join(HERE, "studio-edit-toolbar.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export function getStudioToolbarMountCss(): string {
  if (!cssCache) cssCache = readFileSync(CSS_PATH, "utf8");
  return cssCache;
}

export async function getStudioToolbarMountBundle(): Promise<string> {
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
    plugins: [
      {
        name: "studio-toolbar-mount-next-stubs",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "studio-toolbar-mount:next-link",
            namespace: "studio-toolbar-mount",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "studio-toolbar-mount" },
            () => ({
              contents: `
                import { NextLink } from ${JSON.stringify(STUBS)};
                export default NextLink;
              `,
              loader: "tsx",
              resolveDir: HERE,
            }),
          );
        },
      },
    ],
  });

  const text = result.outputFiles?.[0]?.text;
  if (!text) {
    throw new Error("esbuild produced empty StudioEditToolbar mount bundle");
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

export async function closeStudioToolbarMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export type ToolbarControlRect = {
  label: string;
  testId: string | null;
  tag: string;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type StudioToolbarMountMeasure = {
  mounted: boolean;
  controls: ToolbarControlRect[];
  fit: ToolbarControlRect | null;
  upgrade: ToolbarControlRect | null;
  overlaps: Array<{ a: string; b: string }>;
  audioElementCount: number;
  usedRealButtonAttr: boolean;
};

function overlap(
  a: ToolbarControlRect,
  b: ToolbarControlRect,
): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

export async function measureStudioEditToolbarAt(viewport: {
  width: number;
  height: number;
}): Promise<StudioToolbarMountMeasure> {
  const bundle = await getStudioToolbarMountBundle();
  const css = getStudioToolbarMountCss();
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport });

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
      await route.abort();
    });

    await page.setContent(
      `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"/><style>${css}</style></head><body><div id="studio-toolbar-mount-root"></div></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const api = window.__BRD_STUDIO_TOOLBAR_MOUNT__;
      if (!api) throw new Error("__BRD_STUDIO_TOOLBAR_MOUNT__ missing");
      api.mount("studio-toolbar-mount-root");
    });
    await page.waitForSelector('[data-testid="studio-edit-toolbar"]', {
      timeout: 10_000,
    });

    const measured = await page.evaluate(() => {
      const root = document.querySelector(
        '[data-testid="studio-edit-toolbar"]',
      );
      if (!root) {
        return {
          mounted: false,
          controls: [] as ToolbarControlRect[],
          usedRealButtonAttr: false,
          audioElementCount: document.querySelectorAll("audio").length,
        };
      }
      const interactive = [
        ...root.querySelectorAll("button, a[data-testid], a[href]"),
      ] as HTMLElement[];
      const controls = interactive
        .map((el) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            label: (el.textContent ?? "").trim().replace(/\s+/g, " "),
            testId: el.getAttribute("data-testid"),
            tag: el.tagName.toLowerCase(),
            width: Math.round(r.width * 100) / 100,
            height: Math.round(r.height * 100) / 100,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            visible: style.display !== "none" && r.width > 0 && r.height > 0,
          };
        })
        .filter((c) => c.visible)
        .map(({ visible, ...c }) => {
          void visible;
          return c;
        });
      const usedRealButtonAttr = interactive.some(
        (el) => el.getAttribute("data-slot") === "button",
      );
      return {
        mounted: true,
        controls,
        usedRealButtonAttr,
        audioElementCount: document.querySelectorAll("audio").length,
      };
    });

    const overlaps: Array<{ a: string; b: string }> = [];
    for (let i = 0; i < measured.controls.length; i++) {
      for (let j = i + 1; j < measured.controls.length; j++) {
        const a = measured.controls[i]!;
        const b = measured.controls[j]!;
        if (overlap(a, b)) {
          overlaps.push({ a: a.label || a.testId || "?", b: b.label || b.testId || "?" });
        }
      }
    }

    const fit =
      measured.controls.find((c) => c.label === "Fit") ?? null;
    const upgrade =
      measured.controls.find(
        (c) => c.testId === "studio-track-upgrade-cta",
      ) ?? null;

    return {
      mounted: measured.mounted,
      controls: measured.controls,
      fit,
      upgrade,
      overlaps,
      audioElementCount: measured.audioElementCount,
      usedRealButtonAttr: measured.usedRealButtonAttr,
    };
  } finally {
    await page.close();
  }
}
