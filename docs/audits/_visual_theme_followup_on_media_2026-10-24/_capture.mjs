/**
 * Theme persistence + overlay evidence.
 * Does NOT manually set data-theme after load — asserts localStorage → data-theme.
 * Seeds via storageState (not addInitScript overwrite-on-reload).
 * FOUC is NOT claimed from screenshots alone.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_visual_theme_followup_on_media_2026-10-24",
);
fs.mkdirSync(outDir, { recursive: true });
const base = "http://localhost:3456";
const KEY = "bitrymdym.theme";

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
    origins: [
      {
        origin: base,
        localStorage: [{ name: KEY, value: theme }],
      },
    ],
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

async function assertThemeFromStorage(page, expected) {
  const actual = await page.evaluate((key) => {
    return {
      storage: localStorage.getItem(key),
      dataTheme: document.documentElement.getAttribute("data-theme"),
      hasDarkClass: document.documentElement.classList.contains("dark"),
    };
  }, KEY);
  if (actual.storage !== expected) {
    throw new Error(
      `localStorage ${KEY}=${actual.storage} expected ${expected}`,
    );
  }
  if (actual.dataTheme !== expected) {
    throw new Error(
      `data-theme=${actual.dataTheme} expected ${expected} (from storage; no manual override)`,
    );
  }
  if (actual.hasDarkClass !== (expected === "dark")) {
    throw new Error(
      `.dark class=${actual.hasDarkClass} expected ${expected === "dark"}`,
    );
  }
  return actual;
}

async function shotHome(context, name, theme) {
  const page = await context.newPage();
  await page.addStyleTag({ content: hideDevtoolsCss() });
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  await muteAudio(page);
  await assertThemeFromStorage(page, theme);
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, type: "png", fullPage: false });

  const overlay = page.getByTestId("home-featured-media-overlay");
  const probePng = path.join(
    outDir,
    `probe-overlay-bg-${theme}-${name.includes("mobile") ? "mobile" : "desktop"}.png`,
  );
  const overlayBuf = await overlay.screenshot({ path: probePng, type: "png" });
  const fgCss = await overlay.evaluate((el) => getComputedStyle(el).color);
  const probe = await page.evaluate(
    async ({ b64, fgCss: fg }) => {
      function parseRgb(s) {
        const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      function rel([r, g, b]) {
        const lin = [r, g, b].map((c) => {
          const x = c / 255;
          return x <= 0.03928
            ? x / 12.92
            : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      }
      function ratio(a, b) {
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return (hi + 0.05) / (lo + 0.05);
      }
      const blob = await fetch(`data:image/png;base64,${b64}`).then((r) =>
        r.blob(),
      );
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const y0 = Math.floor(bmp.height * 0.35);
      const y1 = Math.floor(bmp.height * 0.85);
      const x0 = Math.floor(bmp.width * 0.1);
      const x1 = Math.floor(bmp.width * 0.9);
      const data = ctx.getImageData(
        x0,
        y0,
        Math.max(1, x1 - x0),
        Math.max(1, y1 - y0),
      ).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 16) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
      const mean = [
        Math.round(r / n),
        Math.round(g / n),
        Math.round(b / n),
      ];
      const fgRgb = parseRgb(fg) || [239, 233, 223];
      const contrast = ratio(rel(fgRgb), rel(mean));
      return {
        ok: contrast >= 4.5,
        fgCss: fg,
        fgRgb,
        sampledBgRgb: mean,
        usedFallbackBg: false,
        ratio: Number(contrast.toFixed(2)),
        pngSize: { w: bmp.width, h: bmp.height },
      };
    },
    { b64: overlayBuf.toString("base64"), fgCss },
  );
  probe.png = path.basename(probePng);

  await page.close();
  return { file, probe };
}

async function toggleRoundTrip(context, label) {
  const page = await context.newPage();
  await page.addStyleTag({ content: hideDevtoolsCss() });
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60000 });
  await muteAudio(page);
  await assertThemeFromStorage(page, "dark");

  const toggle = page.locator('button[aria-label="Przełącz na jasny motyw"]');
  await toggle.waitFor({ state: "visible", timeout: 15000 });
  await toggle.click({ force: true });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === "light",
    KEY,
    { timeout: 5000 },
  );
  await assertThemeFromStorage(page, "light");
  await page.screenshot({
    path: path.join(outDir, `${label}-after-toggle-light.png`),
    type: "png",
    fullPage: false,
  });

  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await muteAudio(page);
  await assertThemeFromStorage(page, "light");
  await page.screenshot({
    path: path.join(outDir, `${label}-after-reload-light.png`),
    type: "png",
    fullPage: false,
  });

  const toggleDark = page.locator(
    'button[aria-label="Przełącz na ciemny motyw"]',
  );
  await toggleDark.waitFor({ state: "visible", timeout: 15000 });
  await toggleDark.click({ force: true });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === "dark",
    KEY,
    { timeout: 5000 },
  );
  await assertThemeFromStorage(page, "dark");
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await muteAudio(page);
  await assertThemeFromStorage(page, "dark");
  await page.screenshot({
    path: path.join(outDir, `${label}-after-reload-dark.png`),
    type: "png",
    fullPage: false,
  });

  await page.close();
  return true;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true });
const report = { probes: [], toggle: {}, ihdr: [] };

async function runViewport(tag, viewport, isMobile) {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: Boolean(isMobile),
      hasTouch: Boolean(isMobile),
      storageState: storageStateForTheme(theme),
    });
    const { file, probe } = await shotHome(
      context,
      `${theme}-home-${tag}.png`,
      theme,
    );
    report.probes.push({ file: path.basename(file), theme, tag, probe });
    const { w, h } = pngSize(file);
    report.ihdr.push({
      file: path.basename(file),
      w,
      h,
      ok: w === viewport.width && h === viewport.height,
    });
    await context.close();
  }

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: Boolean(isMobile),
    hasTouch: Boolean(isMobile),
    storageState: storageStateForTheme("dark"),
  });
  await toggleRoundTrip(context, `toggle-${tag}`);
  report.toggle[tag] = "PASS";
  for (const f of fs
    .readdirSync(outDir)
    .filter((x) => x.startsWith(`toggle-${tag}`))) {
    const { w, h } = pngSize(path.join(outDir, f));
    report.ihdr.push({
      file: f,
      w,
      h,
      ok: w === viewport.width && h === viewport.height,
    });
  }
  await context.close();
}

await runViewport("desktop-1280x800", { width: 1280, height: 800 }, false);
await runViewport("mobile-390x844", { width: 390, height: 844 }, true);
await browser.close();

fs.writeFileSync(
  path.join(outDir, "capture-report.json"),
  JSON.stringify(report, null, 2),
);

const ihdrFail = report.ihdr.filter((x) => !x.ok);
const probeFail = report.probes.filter((p) => !p.probe?.ok || p.probe.ratio < 4.5);

console.log(JSON.stringify(report, null, 2));
if (ihdrFail.length || probeFail.length) {
  console.error("FAIL", { ihdrFail, probeFail });
  process.exit(2);
}
console.log("CAPTURE_OK");
process.exit(0);
