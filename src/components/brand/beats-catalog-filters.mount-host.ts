/**
 * Node host: esbuild IIFE + Playwright Chromium for BeatsCatalogClient Filtry trap.
 * Excluded from production tsconfig (playwright is a devDependency).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Locator } from "playwright";

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

export type BeatsFiltersShellAxProbe = {
  logoExposed: boolean;
  themeExposed: boolean;
  navBityExposed: boolean;
  shellInert: boolean;
};

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
  shellAxWhileOpen: BeatsFiltersShellAxProbe;
  shellAxAfterClose: BeatsFiltersShellAxProbe;
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

  async function readShellAx(): Promise<BeatsFiltersShellAxProbe> {
    const shellInert = await page.evaluate(() => {
      const shell = document.querySelector(
        "[data-app-shell]",
      ) as HTMLElement | null;
      return Boolean(shell && "inert" in shell && shell.inert);
    });
    const client = await context.newCDPSession(page);
    await client.send("Accessibility.enable");
    const { nodes } = await client.send("Accessibility.getFullAXTree");
    const visible = nodes.filter((n) => !n.ignored);
    const logoExposed = visible.some((n) => {
      const name = n.name?.value || "";
      const role = n.role?.value || "";
      return /BitRymDym/i.test(name) && (role === "link" || role === "StaticText");
    });
    const themeExposed = visible.some((n) => {
      const name = n.name?.value || "";
      return /^Motyw$/i.test(name.trim());
    });
    const navBityExposed = visible.some((n) => {
      const name = n.name?.value || "";
      const role = n.role?.value || "";
      return role === "link" && /^Bity$/i.test(name.trim());
    });
    return { logoExposed, themeExposed, navBityExposed, shellInert };
  }

  // Tab to Filtry
  let onFiltry = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const a = await activeMeta();
    if (a.tag === "button" && /^Filtry/i.test(a.name)) {
      onFiltry = true;
      break;
    }
  }

  const emptyShell: BeatsFiltersShellAxProbe = {
    logoExposed: false,
    themeExposed: false,
    navBityExposed: false,
    shellInert: false,
  };

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
    shellAxWhileOpen: { ...emptyShell },
    shellAxAfterClose: { ...emptyShell },
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

  result.shellAxWhileOpen = await readShellAx();

  {
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
  }

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
  result.shellAxAfterClose = await readShellAx();

  await context.close();
  return result;
}

export type BeatsCatalogResultStatusProbe = {
  mounted: boolean;
  initialStatusText: string;
  initialInAxTree: boolean;
  emptyStatusText: string;
  emptyInAxTree: boolean;
  restoredStatusText: string;
  restoredInAxTree: boolean;
  audioElementCount: number;
  networkNonLocal: number;
};

async function axHasRoleText(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  context: Awaited<ReturnType<Browser["newContext"]>>,
  role: "status",
  text: string,
): Promise<boolean> {
  const client = await context.newCDPSession(page);
  await client.send("Accessibility.enable");
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  function collectName(nodeId: number | undefined, depth = 0): string {
    if (nodeId == null || depth > 6) return "";
    const n = byId.get(nodeId);
    if (!n || n.ignored) return "";
    const self = n.name?.value || "";
    const kids = (n.childIds || [])
      .map((id) => collectName(id, depth + 1))
      .join(" ");
    return `${self} ${kids}`.trim();
  }
  return nodes.some((n) => {
    if (n.ignored) return false;
    if ((n.role?.value || "") !== role) return false;
    return collectName(n.nodeId).includes(text);
  });
}

async function readStatusText(
  page: Awaited<ReturnType<Browser["newPage"]>>,
): Promise<string> {
  return page.getByRole("status").first().innerText();
}

export async function probeBeatsCatalogResultStatus(): Promise<BeatsCatalogResultStatusProbe> {
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

  const emptyProbe: BeatsCatalogResultStatusProbe = {
    mounted: false,
    initialStatusText: "",
    initialInAxTree: false,
    emptyStatusText: "",
    emptyInAxTree: false,
    restoredStatusText: "",
    restoredInAxTree: false,
    audioElementCount: await page.locator("audio").count(),
    networkNonLocal,
  };

  const search = page.locator("#beats-search");
  if ((await search.count()) < 1) {
    await context.close();
    return emptyProbe;
  }

  emptyProbe.mounted = true;

  const initialStatusText = (await readStatusText(page)).trim();
  emptyProbe.initialStatusText = initialStatusText;
  emptyProbe.initialInAxTree = await axHasRoleText(
    page,
    context,
    "status",
    initialStatusText,
  );

  await search.fill("brd_nohit_probe");
  await page.waitForTimeout(50);
  const emptyStatusText = (await readStatusText(page)).trim();
  emptyProbe.emptyStatusText = emptyStatusText;
  emptyProbe.emptyInAxTree = await axHasRoleText(
    page,
    context,
    "status",
    "Cicho. Brak bitów dla tych filtrów.",
  );

  await search.fill("");
  await page.waitForTimeout(50);
  const restoredStatusText = (await readStatusText(page)).trim();
  emptyProbe.restoredStatusText = restoredStatusText;
  emptyProbe.restoredInAxTree = await axHasRoleText(
    page,
    context,
    "status",
    restoredStatusText,
  );

  await context.close();
  return emptyProbe;
}

export type BeatsCatalogBpmFilterStatusProbe = {
  mounted: boolean;
  initialStatusText: string;
  initialInAxTree: boolean;
  backgroundInertWhileOpen: boolean;
  shellInertWhileOpen: boolean;
  showResultsLabelIncludesOne: boolean;
  dialogClosedAfterApply: boolean;
  backgroundInertAfterClose: boolean;
  shellInertAfterClose: boolean;
  statusInertAncestor: boolean;
  statusCount: number;
  finalStatusText: string;
  finalInAxTree: boolean;
  metaAriaHiddenPresent: boolean;
  metaVisibleText: string;
  audioElementCount: number;
  networkNonLocal: number;
};

async function setReactControlledRangeValue(
  slider: Locator,
  value: number,
): Promise<void> {
  await slider.evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(val));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function readBackgroundInert(
  page: Awaited<ReturnType<Browser["newPage"]>>,
): Promise<boolean> {
  return page.evaluate(() => {
    const bg = document.querySelector(
      "[data-beats-catalog-background]",
    ) as HTMLElement | null;
    return Boolean(bg && "inert" in bg && bg.inert);
  });
}

async function readShellInert(
  page: Awaited<ReturnType<Browser["newPage"]>>,
): Promise<boolean> {
  return page.evaluate(() => {
    const shell = document.querySelector(
      "[data-app-shell]",
    ) as HTMLElement | null;
    return Boolean(shell && "inert" in shell && shell.inert);
  });
}

async function readStatusInertAncestor(
  page: Awaited<ReturnType<Browser["newPage"]>>,
): Promise<boolean> {
  return page.evaluate(() => {
    const status = document.querySelector('[role="status"]');
    let node: HTMLElement | null = status as HTMLElement | null;
    while (node) {
      if ("inert" in node && node.inert) return true;
      node = node.parentElement;
    }
    return false;
  });
}

export async function probeBeatsCatalogBpmFilterStatus(): Promise<BeatsCatalogBpmFilterStatusProbe> {
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

  const empty: BeatsCatalogBpmFilterStatusProbe = {
    mounted: false,
    initialStatusText: "",
    initialInAxTree: false,
    backgroundInertWhileOpen: false,
    shellInertWhileOpen: false,
    showResultsLabelIncludesOne: false,
    dialogClosedAfterApply: false,
    backgroundInertAfterClose: true,
    shellInertAfterClose: true,
    statusInertAncestor: true,
    statusCount: 0,
    finalStatusText: "",
    finalInAxTree: false,
    metaAriaHiddenPresent: false,
    metaVisibleText: "",
    audioElementCount: await page.locator("audio").count(),
    networkNonLocal,
  };

  const search = page.locator("#beats-search");
  if ((await search.count()) < 1) {
    await context.close();
    return empty;
  }

  empty.mounted = true;

  const initialStatusText = (await readStatusText(page)).trim();
  empty.initialStatusText = initialStatusText;
  empty.initialInAxTree = await axHasRoleText(
    page,
    context,
    "status",
    initialStatusText,
  );

  await page.getByRole("button", { name: /^Filtry/ }).click();
  await page.getByRole("dialog", { name: "Filtry katalogu" }).waitFor({
    state: "visible",
  });

  empty.backgroundInertWhileOpen = await readBackgroundInert(page);
  empty.shellInertWhileOpen = await readShellInert(page);

  const bpmMaxSlider = page.getByRole("slider", { name: /BPM max/i });
  await setReactControlledRangeValue(bpmMaxSlider, 129);

  const showResults = page.getByRole("button", { name: /Pokaż wyniki/i });
  await showResults.waitFor({ state: "visible" });
  const showResultsText = (await showResults.innerText()).trim();
  empty.showResultsLabelIncludesOne = /Pokaż wyniki \(1\)/.test(showResultsText);

  await showResults.click();
  await page
    .getByRole("dialog", { name: "Filtry katalogu" })
    .waitFor({ state: "hidden" });

  empty.dialogClosedAfterApply = !(await page.evaluate(() =>
    Boolean(
      document.querySelector('[role="dialog"][aria-label="Filtry katalogu"]'),
    ),
  ));

  empty.backgroundInertAfterClose = await readBackgroundInert(page);
  empty.shellInertAfterClose = await readShellInert(page);
  empty.statusInertAncestor = await readStatusInertAncestor(page);
  empty.statusCount = await page.getByRole("status").count();

  const finalStatusText = (await readStatusText(page)).trim();
  empty.finalStatusText = finalStatusText;
  empty.finalInAxTree = await axHasRoleText(
    page,
    context,
    "status",
    "1 bit · z 2",
  );

  empty.metaVisibleText = await page.evaluate(() => {
    const meta = document.querySelector(
      "p.brd-meta[aria-hidden]",
    ) as HTMLElement | null;
    return meta?.textContent?.trim().replace(/\s+/g, " ") ?? "";
  });
  empty.metaAriaHiddenPresent = await page.evaluate(() =>
    Boolean(document.querySelector("p.brd-meta[aria-hidden]")),
  );

  empty.audioElementCount = await page.locator("audio").count();
  empty.networkNonLocal = networkNonLocal;

  await context.close();
  return empty;
}
