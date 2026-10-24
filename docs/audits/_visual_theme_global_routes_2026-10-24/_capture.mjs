/**
 * Global dark chrome evidence across user routes.
 * Seeds theme via storageState; asserts data-theme from storage (no spoof).
 * Logged-in surfaces redirect → captured as gates only.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_visual_theme_global_routes_2026-10-24",
);
fs.mkdirSync(outDir, { recursive: true });
const base = "http://localhost:3456";
const KEY = "bitrymdym.theme";

const ROUTES = [
  { id: "home", path: "/" },
  { id: "beats", path: "/beats" },
  { id: "about", path: "/about" },
  { id: "signin", path: "/sign-in" },
  { id: "signup", path: "/sign-up" },
  { id: "forgot", path: "/forgot-password" },
  { id: "studio-gate", path: "/studio" },
  { id: "takes-gate", path: "/account/takes" },
  { id: "account-gate", path: "/account" },
  { id: "settings-gate", path: "/settings" },
  { id: "library-gate", path: "/library" },
];

function hideDevtoolsCss() {
  return `
    nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog],
    [data-nextjs-dev-overlay], button[aria-label="Open Next.js Dev Tools"],
    [aria-label="Open Next.js Dev Tools"] {
      display: none !important; visibility: hidden !important;
    }
  `;
}

function storageStateForTheme(theme) {
  return {
    cookies: [],
    origins: [{ origin: base, localStorage: [{ name: KEY, value: theme }] }],
  };
}

async function muteAudio(page) {
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
}

async function assertTheme(page, expected) {
  const actual = await page.evaluate((key) => ({
    storage: localStorage.getItem(key),
    dataTheme: document.documentElement.getAttribute("data-theme"),
  }), KEY);
  if (actual.storage !== expected || actual.dataTheme !== expected) {
    throw new Error(
      `theme mismatch storage=${actual.storage} data-theme=${actual.dataTheme} expected ${expected}`,
    );
  }
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true });
const report = { shots: [], togglePlacement: [], ihdr: [], beatHref: null };

async function run(tag, viewport, isMobile) {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: Boolean(isMobile),
      hasTouch: Boolean(isMobile),
      storageState: storageStateForTheme(theme),
    });

    // Resolve beat detail once per theme desktop
    if (!report.beatHref) {
      const p = await context.newPage();
      await p.goto(`${base}/beats`, { waitUntil: "networkidle", timeout: 60000 });
      report.beatHref = await p
        .locator('a[href^="/beat/"]')
        .first()
        .getAttribute("href");
      await p.close();
    }

    const routes = [...ROUTES];
    if (report.beatHref) {
      routes.splice(2, 0, { id: "beat-detail", path: report.beatHref });
    }

    for (const route of routes) {
      const page = await context.newPage();
      await page.addStyleTag({ content: hideDevtoolsCss() });
      await page.goto(`${base}${route.path}`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await page.waitForTimeout(400);
      await muteAudio(page);
      await assertTheme(page, theme);

      // Toggle placement: on AppShell pages, Motyw/Ciemny before Zaloguj or account menu
      const placement = await page.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) {
          const authToggle = document.querySelector(
            'button[aria-label*="motyw" i]',
          );
          return {
            surface: "auth-or-gate",
            hasToggle: Boolean(authToggle),
            finalUrl: location.pathname,
          };
        }
        const buttons = [...header.querySelectorAll("a, button")].map((el) =>
          (el.getAttribute("aria-label") || el.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 40),
        );
        const toggleIdx = buttons.findIndex((t) =>
          /Ciemny|Jasny|motyw/i.test(t),
        );
        const authIdx = buttons.findIndex((t) =>
          /Zaloguj|Dołącz|^[A-Z]$|Konto|Panel/i.test(t),
        );
        return {
          surface: "header",
          buttons,
          toggleIdx,
          authIdx,
          toggleBeforeAuth:
            toggleIdx >= 0 && authIdx >= 0 ? toggleIdx < authIdx : null,
          finalUrl: location.pathname,
        };
      });
      report.togglePlacement.push({
        theme,
        tag,
        route: route.id,
        ...placement,
      });

      const file = path.join(outDir, `${theme}-${route.id}-${tag}.png`);
      await page.screenshot({ path: file, type: "png", fullPage: false });
      const { w, h } = pngSize(file);
      report.ihdr.push({
        file: path.basename(file),
        w,
        h,
        ok: w === viewport.width && h === viewport.height,
      });
      report.shots.push({
        file: path.basename(file),
        theme,
        route: route.id,
        url: placement.finalUrl,
        gated:
          route.id.includes("gate") ||
          (route.id !== "signin" &&
            route.id !== "signup" &&
            route.id !== "forgot" &&
            placement.finalUrl.includes("sign-in")),
      });
      await page.close();
    }
    await context.close();
  }
}

await run("desktop-1280x800", { width: 1280, height: 800 }, false);
await run("mobile-390x844", { width: 390, height: 844 }, true);
await browser.close();

fs.writeFileSync(
  path.join(outDir, "capture-report.json"),
  JSON.stringify(report, null, 2),
);

const ihdrFail = report.ihdr.filter((x) => !x.ok);
const headerFail = report.togglePlacement.filter(
  (p) =>
    p.surface === "header" &&
    p.toggleBeforeAuth === false,
);

console.log(JSON.stringify({ ihdrFail, headerFail, summary: {
  shots: report.shots.length,
  beatHref: report.beatHref,
} }, null, 2));

if (ihdrFail.length || headerFail.length) {
  process.exit(2);
}
console.log("CAPTURE_OK");
process.exit(0);
