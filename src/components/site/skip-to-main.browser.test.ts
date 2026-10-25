/**
 * WCAG 2.4.1 — native keyboard path for skip-link (Tab → Enter → #main-content).
 *
 * Gate: BRD_BROWSER_A11Y=1 + NEXT_HTTP_BASE_URL=http://127.0.0.1:<port>
 * Target: public route with SiteHeader (default /about). No login, no cookies/storage seed.
 * Does not call element.focus() on the skip link; uses Playwright keyboard only.
 *
 * Preview must not point at production Supabase — override NEXT_PUBLIC_SUPABASE_*
 * to loopback-only dummies (or unset) so the page never talks to *.supabase.co.
 */
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = (process.env.NEXT_HTTP_BASE_URL ?? "").replace(/\/$/, "");
const routePath = process.env.BRD_SKIP_LINK_ROUTE ?? "/about";
const live = process.env.BRD_BROWSER_A11Y === "1" && Boolean(baseUrl);

function assertLoopback(url: string, label: string): void {
  const host = new URL(url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`${label} must be loopback, got ${host}`);
  }
}

if (live) {
  assertLoopback(baseUrl, "NEXT_HTTP_BASE_URL");
}

const SKIP_NAME = "Przejdź do treści";

describe.runIf(live)("skip-to-main native keyboard (browser)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
    page = await browser.newPage();
    // Fresh context — no cookies / storage seeding.
    await page.goto(`${baseUrl}${routePath}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("Tab focuses skip-link, Enter moves focus to #main-content, skip is visible while focused", async () => {
    // Start from document body — do not click chrome (would skip past the
    // sr-only link) and do not call focus() on the skip link itself.
    const before = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? null,
        text: (el?.textContent ?? "").trim().slice(0, 40),
        href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
      };
    });
    expect(before.tag).toBe("BODY");
    expect(before.href).not.toBe("#main-content");

    // Focus the document body (not the skip link), then send native Tab.
    // page.keyboard.press alone can leave focus on BODY under Vitest/headless.
    await page.locator("body").press("Tab");

    const onSkip = await page.evaluate((expectedName) => {
      const el = document.activeElement;
      if (!(el instanceof HTMLAnchorElement)) {
        return {
          ok: false as const,
          reason: `active=${el?.tagName ?? "null"}`,
        };
      }
      const text = (el.textContent ?? "").trim();
      const href = el.getAttribute("href");
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visuallyShown =
        style.position === "absolute" &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.clip !== "rect(0px, 0px, 0px, 0px)" &&
        style.clipPath !== "inset(50%)";
      return {
        ok: true as const,
        text,
        href,
        visuallyShown,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        matchesName: text === expectedName,
      };
    }, SKIP_NAME);

    expect(onSkip.ok, `Tab did not land on skip-link: ${JSON.stringify(onSkip)}`).toBe(
      true,
    );
    if (!onSkip.ok) return;
    expect(onSkip.matchesName).toBe(true);
    expect(onSkip.href).toBe("#main-content");
    expect(onSkip.visuallyShown).toBe(true);
    expect(onSkip.width).toBeGreaterThan(8);
    expect(onSkip.height).toBeGreaterThan(8);

    await page.keyboard.press("Enter");

    const after = await page.evaluate(() => {
      const el = document.activeElement;
      const target = document.getElementById("main-content");
      return {
        activeId: el?.id ?? null,
        activeTag: el?.tagName ?? null,
        hash: location.hash,
        targetExists: Boolean(target),
        targetIsActive: el === target,
      };
    });

    expect(after.targetExists).toBe(true);
    expect(after.hash).toBe("#main-content");
    expect(after.targetIsActive || after.activeId === "main-content").toBe(true);
  });
});

describe.runIf(!live)("skip-to-main native keyboard (browser) — gated", () => {
  it("NOT RUN — set BRD_BROWSER_A11Y=1 and NEXT_HTTP_BASE_URL loopback", () => {
    expect(live).toBe(false);
  });
});
