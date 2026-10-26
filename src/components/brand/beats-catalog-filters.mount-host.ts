/**
 * Node host: esbuild IIFE + Playwright Chromium for BeatsCatalogClient Filtry trap.
 * Excluded from production tsconfig (playwright is a devDependency).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "beats-catalog-filters.mount-entry.tsx");
const STUBS = path.join(HERE, "beats-catalog-filters.mount-stubs.tsx");
const CSS_PATH = path.join(HERE, "beats-catalog-filters.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export function getBeatsFiltersMountCss(): string {
  if (!cssCache) cssCache = readFileSync(CSS_PATH, "utf8");
  return cssCache;
}

export async function getBeatsFiltersMountBundle(): Promise<string> {
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
        name: "beats-filters-mount-stubs",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "beats-filters-mount:next-link",
            namespace: "beats-filters-mount",
          }));
          build.onResolve(
            { filter: /beat-catalog-row$/ },
            () => ({
              path: "beats-filters-mount:beat-row",
              namespace: "beats-filters-mount",
            }),
          );
          build.onLoad(
            { filter: /.*/, namespace: "beats-filters-mount" },
            (args) => {
              if (args.path === "beats-filters-mount:next-link") {
                return {
                  contents: `
                    import { NextLinkStub } from ${JSON.stringify(STUBS)};
                    export default NextLinkStub;
                  `,
                  loader: "tsx",
                  resolveDir: HERE,
                };
              }
              return {
                contents: `
                  export { BeatCatalogRowStub as BeatCatalogRow } from ${JSON.stringify(STUBS)};
                `,
                loader: "tsx",
                resolveDir: HERE,
              };
            },
          );
        },
      },
    ],
  });

  const text = result.outputFiles?.[0]?.text;
  if (!text) {
    throw new Error("esbuild produced empty BeatsCatalogClient mount bundle");
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

export async function closeBeatsFiltersMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export function invalidateBeatsFiltersMountBundle(): void {
  bundleCache = null;
  cssCache = null;
}

export type BeatsFiltersKeyboardProbe = {
  mounted: boolean;
  afterOpenInsideDialog: boolean;
  afterOpenName: string;
  tabForwardEscaped: boolean;
  tabBackwardEscaped: boolean;
  escapeClosed: boolean;
  focusBackOnFiltry: boolean;
  uniqueInDialogForward: string[];
  backgroundInertWhileOpen: boolean;
  catalogSearchExposedInAxWhileOpen: boolean;
  audioElementCount: number;
  networkNonLocal: number;
};

export async function probeBeatsFiltersKeyboard(): Promise<BeatsFiltersKeyboardProbe> {
  const [js, css] = await Promise.all([
    getBeatsFiltersMountBundle(),
    Promise.resolve(getBeatsFiltersMountCss()),
  ]);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let networkNonLocal = 0;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      await route.continue();
      return;
    }
    if (
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost") ||
      url.startsWith("https://localhost")
    ) {
      await route.continue();
      return;
    }
    networkNonLocal += 1;
    await route.abort();
  });

  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head>
    <body>
      <div id="beats-filters-mount-root"></div>
      <script>${js}</script>
      <script>window.__BRD_BEATS_FILTERS_MOUNT__.mount();</script>
    </body></html>`,
    { waitUntil: "domcontentloaded" },
  );

  async function activeMeta() {
    return page.evaluate(() => {
      const el = document.activeElement;
      const dialog = document.querySelector(
        '[role="dialog"][aria-label="Filtry katalogu"]',
      );
      const name = (
        el?.getAttribute("aria-label") ||
        el?.textContent ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 48);
      return {
        tag: el?.tagName?.toLowerCase() ?? "null",
        name,
        insideDialog: dialog ? dialog.contains(el) : false,
      };
    });
  }

  async function dialogOpen() {
    return page.evaluate(() =>
      Boolean(
        document.querySelector('[role="dialog"][aria-label="Filtry katalogu"]'),
      ),
    );
  }

  // Tab to Filtry
  let onFiltry = false;
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press("Tab");
    const a = await activeMeta();
    if (a.tag === "button" && /^Filtry/i.test(a.name)) {
      onFiltry = true;
      break;
    }
  }

  const result: BeatsFiltersKeyboardProbe = {
    mounted: onFiltry,
    afterOpenInsideDialog: false,
    afterOpenName: "",
    tabForwardEscaped: true,
    tabBackwardEscaped: true,
    escapeClosed: false,
    focusBackOnFiltry: false,
    uniqueInDialogForward: [],
    backgroundInertWhileOpen: false,
    catalogSearchExposedInAxWhileOpen: true,
    audioElementCount: await page.locator("audio").count(),
    networkNonLocal,
  };

  if (!onFiltry) {
    await context.close();
    return result;
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const afterOpen = await activeMeta();
  result.afterOpenInsideDialog = afterOpen.insideDialog;
  result.afterOpenName = afterOpen.name;

  result.backgroundInertWhileOpen = await page.evaluate(() => {
    const bg = document.querySelector(
      "[data-beats-catalog-background]",
    ) as HTMLElement | null;
    return Boolean(bg && "inert" in bg && bg.inert);
  });

  const client = await context.newCDPSession(page);
  await client.send("Accessibility.enable");
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  result.catalogSearchExposedInAxWhileOpen = nodes.some((n) => {
    if (n.ignored) return false;
    const name = n.name?.value || "";
    const role = n.role?.value || "";
    return (
      role === "searchbox" ||
      (/szukaj/i.test(name) && (role === "searchbox" || role === "textbox"))
    );
  });

  const forwardNames: string[] = [];
  let forwardEscaped = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const a = await activeMeta();
    if (!a.insideDialog) {
      forwardEscaped = true;
      break;
    }
    forwardNames.push(`${a.tag}:${a.name}`);
  }
  result.tabForwardEscaped = forwardEscaped;
  result.uniqueInDialogForward = [...new Set(forwardNames)];

  let backwardEscaped = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Shift+Tab");
    const a = await activeMeta();
    if (!a.insideDialog) {
      backwardEscaped = true;
      break;
    }
  }
  result.tabBackwardEscaped = backwardEscaped;

  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  result.escapeClosed = !(await dialogOpen());
  const afterEsc = await activeMeta();
  result.focusBackOnFiltry =
    afterEsc.tag === "button" && /^Filtry/i.test(afterEsc.name);

  await context.close();
  return result;
}
