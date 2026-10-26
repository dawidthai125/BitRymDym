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

/** Drop esbuild/CSS cache after source edits within the same Vitest process. */
export function invalidateStudioToolbarMountBundle(): void {
  bundleCache = null;
  cssCache = null;
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
      `<!DOCTYPE html><html lang="pl" data-brd-toolbar-hit-measure="1"><head><meta charset="utf-8"/><style>${css}</style></head><body><div id="studio-toolbar-mount-root"></div></body></html>`,
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

export type ToolbarKeyboardStop = {
  label: string;
  testId: string | null;
  tag: string;
  ariaExpanded: string | null;
  matchesFocusVisible: boolean;
  hasVisibleFocusIndicator: boolean;
};

export type StudioToolbarKeyboardProbe = {
  mounted: boolean;
  usedRealButtonAttr: boolean;
  audioElementCount: number;
  networkAborted: number;
  networkAllowedNonLocal: number;
  tabStops: ToolbarKeyboardStop[];
  allStopsNamed: boolean;
  allStopsFocusVisible: boolean;
  moreButtonPresent: boolean;
  moreOpenViaEnter: {
    ariaExpanded: string | null;
    overflowHiddenClass: boolean;
    overflowDisplay: string;
  } | null;
  moreAfterEscape: {
    ariaExpanded: string | null;
    overflowHiddenClass: boolean;
    overflowDisplay: string;
    focusBackOnMore: boolean;
  } | null;
  activatedForbiddenAction: boolean;
};

type FocusSnapshot = {
  label: string;
  testId: string | null;
  tag: string;
  ariaExpanded: string | null;
  matchesFocusVisible: boolean;
  hasVisibleFocusIndicator: boolean;
  isBody: boolean;
};

async function readActiveFocus(page: {
  evaluate: (fn: () => FocusSnapshot) => Promise<FocusSnapshot>;
}): Promise<FocusSnapshot> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return {
        label: "",
        testId: null,
        tag: "body",
        ariaExpanded: null,
        matchesFocusVisible: false,
        hasVisibleFocusIndicator: false,
        isBody: true,
      };
    }
    const cs = window.getComputedStyle(el);
    const outlineOk =
      cs.outlineStyle !== "none" &&
      cs.outlineStyle !== "" &&
      cs.outlineWidth !== "0px";
    const shadowOk = Boolean(cs.boxShadow && cs.boxShadow !== "none");
    const label = (
      el.getAttribute("aria-label") ||
      el.textContent ||
      el.getAttribute("title") ||
      ""
    )
      .trim()
      .replace(/\s+/g, " ");
    return {
      label,
      testId: el.getAttribute("data-testid"),
      tag: el.tagName.toLowerCase(),
      ariaExpanded: el.getAttribute("aria-expanded"),
      matchesFocusVisible: el.matches(":focus-visible"),
      hasVisibleFocusIndicator: outlineOk || shadowOk,
      isBody: false,
    };
  });
}

/**
 * Native Tab / Enter / Escape against real StudioEditToolbar.
 * Does not click menu actions that mutate project data.
 * Omits hit-measure CSS override so mobile Więcej can open/close for real.
 */
export async function probeStudioEditToolbarKeyboardAt(viewport: {
  width: number;
  height: number;
}): Promise<StudioToolbarKeyboardProbe> {
  const bundle = await getStudioToolbarMountBundle();
  const css = getStudioToolbarMountCss();
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport });
  let networkAborted = 0;
  let networkAllowedNonLocal = 0;
  let activatedForbiddenAction = false;

  try {
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (
        url.startsWith("data:") ||
        url === "about:blank" ||
        url.startsWith("blob:")
      ) {
        networkAllowedNonLocal += 0;
        await route.continue();
        return;
      }
      networkAborted += 1;
      await route.abort();
    });

    page.on("pageerror", (err) => {
      if (/mount harness forbids toolbar action/.test(err.message)) {
        activatedForbiddenAction = true;
      }
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

    const meta = await page.evaluate(() => {
      const root = document.querySelector(
        '[data-testid="studio-edit-toolbar"]',
      );
      const interactive = root
        ? ([
            ...root.querySelectorAll("button, a[href]"),
          ] as HTMLElement[])
        : [];
      return {
        mounted: Boolean(root),
        usedRealButtonAttr: interactive.some(
          (el) => el.getAttribute("data-slot") === "button",
        ),
        audioElementCount: document.querySelectorAll("audio").length,
        moreButtonPresent: (() => {
          const el = document.querySelector(
            '[data-testid="studio-toolbar-more"]',
          ) as HTMLElement | null;
          if (!el) return false;
          const cs = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return cs.display !== "none" && r.width > 0 && r.height > 0;
        })(),
      };
    });

    await page.locator("body").click({ position: { x: 1, y: 1 } });

    const tabStops: ToolbarKeyboardStop[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      const snap = await readActiveFocus(page);
      if (snap.isBody) break;
      const key = `${snap.tag}:${snap.testId ?? ""}:${snap.label}`;
      if (seen.has(key)) break;
      seen.add(key);
      tabStops.push({
        label: snap.label,
        testId: snap.testId,
        tag: snap.tag,
        ariaExpanded: snap.ariaExpanded,
        matchesFocusVisible: snap.matchesFocusVisible,
        hasVisibleFocusIndicator: snap.hasVisibleFocusIndicator,
      });
    }

    const isMobile = viewport.width < 768;
    let moreOpenViaEnter: StudioToolbarKeyboardProbe["moreOpenViaEnter"] =
      null;
    let moreAfterEscape: StudioToolbarKeyboardProbe["moreAfterEscape"] =
      null;

    if (isMobile && meta.moreButtonPresent) {
      const more = page.locator('[data-testid="studio-toolbar-more"]');
      await more.focus();
      await page.keyboard.press("Enter");
      moreOpenViaEnter = await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-testid="studio-toolbar-more"]',
        );
        const overflow = document.querySelector(
          '[data-testid="studio-toolbar-overflow"]',
        ) as HTMLElement | null;
        return {
          ariaExpanded: btn?.getAttribute("aria-expanded") ?? null,
          overflowHiddenClass: overflow?.classList.contains("hidden") ?? true,
          overflowDisplay: overflow
            ? window.getComputedStyle(overflow).display
            : "none",
        };
      });

      await page.keyboard.press("Escape");
      const afterEsc = await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-testid="studio-toolbar-more"]',
        ) as HTMLElement | null;
        const overflow = document.querySelector(
          '[data-testid="studio-toolbar-overflow"]',
        ) as HTMLElement | null;
        return {
          ariaExpanded: btn?.getAttribute("aria-expanded") ?? null,
          overflowHiddenClass: overflow?.classList.contains("hidden") ?? true,
          overflowDisplay: overflow
            ? window.getComputedStyle(overflow).display
            : "none",
          focusBackOnMore:
            document.activeElement === btn ||
            document.activeElement?.getAttribute("data-testid") ===
              "studio-toolbar-more",
        };
      });
      moreAfterEscape = afterEsc;
    }

    return {
      mounted: meta.mounted,
      usedRealButtonAttr: meta.usedRealButtonAttr,
      audioElementCount: meta.audioElementCount,
      networkAborted,
      networkAllowedNonLocal,
      tabStops,
      allStopsNamed: tabStops.every((s) => s.label.length > 0),
      allStopsFocusVisible: tabStops.every(
        (s) => s.matchesFocusVisible && s.hasVisibleFocusIndicator,
      ),
      moreButtonPresent: meta.moreButtonPresent,
      moreOpenViaEnter,
      moreAfterEscape,
      activatedForbiddenAction,
    };
  } finally {
    await page.close();
  }
}
