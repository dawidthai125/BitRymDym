/**
 * Real BeatsCatalogClient — search/filter result count live region (role=status).
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeBeatsFiltersMountHost,
  getBeatsFiltersMountBundle,
  getBeatsFiltersMountCss,
  invalidateBeatsFiltersMountBundle,
  probeBeatsCatalogBpmFilterStatus,
  probeBeatsCatalogResultStatus,
} from "@/components/brand/beats-catalog-filters.mount-host";

type AxNode = {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
};

async function countSortujComboboxesInAxTree(
  page: Page,
  context: BrowserContext,
): Promise<number> {
  const client = await context.newCDPSession(page);
  await client.send("Accessibility.enable");
  const { nodes } = (await client.send("Accessibility.getFullAXTree")) as {
    nodes: AxNode[];
  };
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));

  function collectName(nodeId: string | undefined, depth = 0): string {
    if (nodeId == null || depth > 6) return "";
    const n = byId.get(nodeId);
    if (!n || n.ignored) return "";
    const self = n.name?.value || "";
    const kids = (n.childIds || [])
      .map((id) => collectName(id, depth + 1))
      .join(" ");
    return `${self} ${kids}`.trim();
  }

  return nodes.filter((n) => {
    if (n.ignored) return false;
    if ((n.role?.value || "") !== "combobox") return false;
    return /^Sortuj$/i.test(collectName(n.nodeId));
  }).length;
}

async function probeSortComboboxAtViewport(
  page: Page,
  context: BrowserContext,
  js: string,
  css: string,
): Promise<{ networkNonLocal: number; audioElementCount: number }> {
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

  const audioElementCount = await page.locator("audio").count();

  expect(await page.locator("#beats-search").count()).toBe(1);
  expect(await page.locator("select").count()).toBe(2);

  const sortCombobox = page.getByRole("combobox", {
    name: "Sortuj",
    exact: true,
  });
  expect(await sortCombobox.count()).toBe(1);
  expect(await sortCombobox.isVisible()).toBe(true);
  expect(await sortCombobox.inputValue()).toBe("newest");
  expect(await countSortujComboboxesInAxTree(page, context)).toBe(1);

  return { networkNonLocal, audioElementCount };
}

describe("beats catalog — result status live region (real mount)", () => {
  afterAll(async () => {
    await closeBeatsFiltersMountHost();
  });

  it("initial count; search→0 empty copy; clear→restored; no audio/network", async () => {
    invalidateBeatsFiltersMountBundle();
    const p = await probeBeatsCatalogResultStatus();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.searchFoundByAccessibleName, JSON.stringify(p)).toBe(true);
    expect(p.searchPlaceholder, JSON.stringify(p)).toBe(
      "Szukaj bitu, producenta, gatunku…",
    );
    expect(p.searchPlaceholderIsNotAccessibleName, JSON.stringify(p)).toBe(
      true,
    );
    expect(p.audioElementCount).toBe(0);
    expect(p.networkNonLocal).toBe(0);
    expect(p.initialStatusText, JSON.stringify(p)).toBe("2 bity");
    expect(p.initialInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.emptyStatusText, JSON.stringify(p)).toBe(
      "Cicho. Brak bitów dla tych filtrów.",
    );
    expect(p.emptyInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.restoredStatusText, JSON.stringify(p)).toBe("2 bity");
    expect(p.restoredInAxTree, JSON.stringify(p)).toBe(true);
  }, 90_000);

  it("Filtry→BPM max 129→Pokaż wyniki: live status 1 bit · z 2; inert restored", async () => {
    invalidateBeatsFiltersMountBundle();
    const p = await probeBeatsCatalogBpmFilterStatus();
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.audioElementCount).toBe(0);
    expect(p.networkNonLocal).toBe(0);
    expect(p.initialStatusText, JSON.stringify(p)).toBe("2 bity");
    expect(p.initialInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.backgroundInertWhileOpen, JSON.stringify(p)).toBe(true);
    expect(p.shellInertWhileOpen, JSON.stringify(p)).toBe(true);
    expect(p.showResultsLabelIncludesOne, JSON.stringify(p)).toBe(true);
    expect(p.dialogClosedAfterApply, JSON.stringify(p)).toBe(true);
    expect(p.backgroundInertAfterClose, JSON.stringify(p)).toBe(false);
    expect(p.shellInertAfterClose, JSON.stringify(p)).toBe(false);
    expect(p.statusInertAncestor, JSON.stringify(p)).toBe(false);
    expect(p.statusCount, JSON.stringify(p)).toBe(1);
    expect(p.finalStatusText, JSON.stringify(p)).toBe("1 bit · z 2");
    expect(p.finalInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.metaAriaHiddenPresent, JSON.stringify(p)).toBe(true);
    expect(p.metaVisibleText, JSON.stringify(p)).toMatch(/1 bit · z 2/);
  }, 90_000);

  it("mobile + desktop: one visible Sortuj combobox; two selects in DOM; no audio/network", async () => {
    invalidateBeatsFiltersMountBundle();
    const [js, css] = await Promise.all([
      getBeatsFiltersMountBundle(),
      Promise.resolve(getBeatsFiltersMountCss()),
    ]);

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });

    const viewports = [
      {
        width: 390,
        height: 844,
        isMobile: true as const,
        hasTouch: true as const,
      },
      {
        width: 1280,
        height: 800,
        isMobile: false as const,
        hasTouch: false as const,
      },
    ];

    try {
      for (const vp of viewports) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
        });
        const page = await context.newPage();
        const probe = await probeSortComboboxAtViewport(page, context, js, css);
        expect(probe.audioElementCount).toBe(0);
        expect(probe.networkNonLocal).toBe(0);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }, 90_000);
});
