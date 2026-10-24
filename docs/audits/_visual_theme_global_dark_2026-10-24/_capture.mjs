import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve("docs/audits/_visual_theme_global_dark_2026-10-24");
fs.mkdirSync(outDir, { recursive: true });
const base = "http://localhost:3456";

async function prepare(page, theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("bitrymdym.theme", t);
    } catch {
      /* ignore */
    }
  }, theme);
  await page.addStyleTag({
    content: `
      nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog],
      [data-nextjs-dev-overlay], button[aria-label="Open Next.js Dev Tools"],
      [aria-label="Open Next.js Dev Tools"] {
        display: none !important; visibility: hidden !important;
      }
    `,
  });
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
}

async function shot(context, name, url, theme) {
  const page = await context.newPage();
  await prepare(page, theme);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  await prepare(page, theme);
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.style.colorScheme = t;
  }, theme);
  await page.waitForTimeout(200);
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, type: "png", fullPage: false });
  await page.close();
  return file;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true });

async function runViewport(label, viewport, isMobile) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: Boolean(isMobile),
    hasTouch: Boolean(isMobile),
  });

  const sizeTag =
    viewport.width === 1280 ? "desktop-1280x800" : "mobile-390x844";

  for (const theme of ["dark", "light"]) {
    await shot(
      context,
      `${theme}-home-${sizeTag}.png`,
      `${base}/`,
      theme,
    );
    await shot(
      context,
      `${theme}-beats-${sizeTag}.png`,
      `${base}/beats`,
      theme,
    );
    // First published beat detail if available — use catalog landing hash-less path
    await shot(
      context,
      `${theme}-settings-${sizeTag}.png`,
      `${base}/settings`,
      theme,
    );
    await shot(
      context,
      `${theme}-studio-gate-${sizeTag}.png`,
      `${base}/studio`,
      theme,
    );
    await shot(
      context,
      `${theme}-takes-gate-${sizeTag}.png`,
      `${base}/account/takes`,
      theme,
    );
    await shot(
      context,
      `${theme}-signin-${sizeTag}.png`,
      `${base}/sign-in`,
      theme,
    );
  }

  // Beat detail: resolve first beat link from /beats
  const page = await context.newPage();
  await prepare(page, "dark");
  await page.goto(`${base}/beats`, { waitUntil: "networkidle", timeout: 60000 });
  const href = await page.locator('a[href^="/beat/"]').first().getAttribute("href");
  await page.close();
  if (href) {
    for (const theme of ["dark", "light"]) {
      await shot(
        context,
        `${theme}-beat-detail-${sizeTag}.png`,
        `${base}${href}`,
        theme,
      );
    }
  } else {
    console.log("NO_BEAT_LINK");
  }

  await context.close();
  console.log(`done ${label}`);
}

await runViewport("desktop", { width: 1280, height: 800 }, false);
await runViewport("mobile", { width: 390, height: 844 }, true);
await browser.close();

let ok = true;
for (const f of fs.readdirSync(outDir).filter((x) => x.endsWith(".png"))) {
  const { w, h } = pngSize(path.join(outDir, f));
  const expect =
    f.includes("desktop")
      ? w === 1280 && h === 800
      : w === 390 && h === 844;
  if (!expect) ok = false;
  console.log(`${f}\t${w}x${h}\t${expect ? "OK" : "FAIL"}`);
}
process.exit(ok ? 0 : 2);
