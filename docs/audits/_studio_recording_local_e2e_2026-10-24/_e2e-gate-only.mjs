/**
 * Capture recording panel gate + R state only (desktop). Then mobile shots if Motyw found.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const KEY = "bitrymdym.theme";
const FIXTURE = "Visual Fixture — Local Only";
const creds = JSON.parse(fs.readFileSync(process.env.CREDS_PATH, "utf8"));
const base = creds.base;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
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

async function setTheme(page, theme) {
  // Prefer known labels; fall back to any Motyw control
  const preferred =
    theme === "light"
      ? page.locator(
          'button[aria-label="Przełącz na jasny motyw"], button[aria-label*="jasny motyw"]',
        )
      : page.locator(
          'button[aria-label="Przełącz na ciemny motyw"], button[aria-label*="ciemny motyw"]',
        );
  if ((await preferred.count()) > 0) {
    await preferred.first().click({ force: true });
  } else {
    const any = page.locator("header button").filter({ hasText: /motyw|Ciemny|Jasny/i });
    if ((await any.count()) > 0) await any.first().click({ force: true });
    else throw new Error("motyw-control-missing");
  }
  await page.waitForTimeout(600);
  return page.evaluate(
    ({ key, theme: t }) => {
      const root = document.documentElement;
      return {
        storage: localStorage.getItem(key),
        dataTheme: root.getAttribute("data-theme"),
        hasDark: root.classList.contains("dark"),
        match:
          localStorage.getItem(key) === t &&
          root.getAttribute("data-theme") === t &&
          root.classList.contains("dark") === (t === "dark"),
      };
    },
    { key: KEY, theme },
  );
}

const report = { capturedAt: new Date().toISOString(), ihdr: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90000 });
await page.getByLabel(/e-mail/i).fill(creds.email);
await page.getByLabel(/hasło|password/i).fill(creds.password);
await page.getByRole("button", { name: /zaloguj/i }).click();
await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60000 });
await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
const openBtn = page.getByRole("button", { name: /^Otwórz$/i });
if ((await openBtn.count()) > 0) await openBtn.first().click();
else await page.locator('a[href*="/studio/p/"]').first().click();
await page.waitForURL(/\/studio\/p\/[^/]+/, { timeout: 60000 });
await muteAudio(page);
const projectId = new URL(page.url()).pathname.split("/").pop();

const body0 = await page.evaluate(() => document.body.innerText || "");
report.fixtureOnEditor = body0.includes(FIXTURE);

// RECORD / transport
const recordTab = page.getByRole("button", { name: /^RECORD$/i });
if ((await recordTab.count()) > 0) await recordTab.first().click({ force: true });
await page.waitForTimeout(400);
const tButtons = page.locator('[data-testid="studio-transport"] button');
const tCount = await tButtons.count();
const tLabels = [];
for (let i = 0; i < tCount; i++) {
  tLabels.push({
    aria: await tButtons.nth(i).getAttribute("aria-label"),
    text: ((await tButtons.nth(i).innerText()) || "").trim().slice(0, 40),
  });
}
report.transportButtons = tLabels;
const recLike = tButtons.filter({
  has: page.locator(
    '[aria-label*="Nagraj"], [aria-label*="Record"], [aria-label*="REC"], [aria-label*="Nagryw"]',
  ),
});
// click by aria substring
for (const lab of tLabels) {
  if (lab.aria && /nagraj|record|rec|nagryw/i.test(lab.aria)) {
    await page
      .locator(`[data-testid="studio-transport"] button[aria-label="${lab.aria}"]`)
      .first()
      .click({ force: true });
    await page.waitForTimeout(600);
    break;
  }
}

const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
report.panelVisible = await panel.isVisible().catch(() => false);
const panelText = report.panelVisible
  ? await panel.innerText()
  : await page.evaluate(() => document.body.innerText || "");
report.panelSnippet = String(panelText).slice(0, 900);
report.gate = {
  publishedOnlyCopy: /Nagrywanie dostępne tylko dla opublikowanych bitów|tylko dla opublikowanych/i.test(
    panelText,
  ),
  eligibilityMessage: /opublikowanych bitów/i.test(panelText),
  prepareMic: /Przygotuj mikrofon/i.test(panelText),
  nagrajPrimary: /●\s*Nagraj/.test(panelText),
};
report.recordingGateStatus = report.gate.publishedOnlyCopy
  ? "PRESENT_BLOCKING"
  : report.gate.nagrajPrimary
    ? "LIFTED"
    : "NOT_VERIFIED";

// R
const rButtons = page.locator("button", { hasText: /^R$/ });
const countR = await rButtons.count();
const before = [];
for (let i = 0; i < countR; i++)
  before.push(await rButtons.nth(i).getAttribute("aria-pressed"));
if (countR > 0) {
  await rButtons.nth(0).dispatchEvent("click");
  await page.waitForTimeout(800);
}
const after = [];
for (let i = 0; i < countR; i++)
  after.push(await rButtons.nth(i).getAttribute("aria-pressed"));
report.consciousArm = {
  before,
  after,
  status: after.some((a) => a === "true") ? "PASS" : "FAIL",
};

// Desktop already have approved-attached shots; ensure theme RT + mobile
try {
  let light = await setTheme(page, "light");
  if (!light.match) {
    await setTheme(page, "dark");
    light = await setTheme(page, "light");
  }
  await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
  light = await page.evaluate((key) => {
    const root = document.documentElement;
    return {
      match:
        localStorage.getItem(key) === "light" &&
        root.getAttribute("data-theme") === "light" &&
        !root.classList.contains("dark"),
    };
  }, KEY);
  await page.goto(`${base}/studio/p/${projectId}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await muteAudio(page);
  await page.reload({ waitUntil: "networkidle" });
  const afterReloadLight = await page.evaluate((key) => {
    const root = document.documentElement;
    return {
      storage: localStorage.getItem(key),
      dataTheme: root.getAttribute("data-theme"),
      hasDark: root.classList.contains("dark"),
    };
  }, KEY);
  let dark = await setTheme(page, "dark");
  await page.reload({ waitUntil: "networkidle" });
  const afterReloadDark = await page.evaluate((key) => {
    const root = document.documentElement;
    return {
      storage: localStorage.getItem(key),
      dataTheme: root.getAttribute("data-theme"),
      hasDark: root.classList.contains("dark"),
    };
  }, KEY);
  report.themeRoundTrip = {
    status:
      afterReloadLight.storage === "light" &&
      afterReloadLight.dataTheme === "light" &&
      afterReloadLight.hasDark === false &&
      afterReloadDark.storage === "dark" &&
      afterReloadDark.dataTheme === "dark" &&
      afterReloadDark.hasDark === true
        ? "PASS"
        : "FAIL",
    afterReloadLight,
    afterReloadDark,
  };
} catch (e) {
  report.themeRoundTrip = {
    status: "FAIL",
    error: String(e?.message || e).slice(0, 160),
  };
}

// Mobile shots — Motyw may be in overflow; try desktop-size theme then resize
await setTheme(page, "dark").catch(() => {});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
for (const theme of ["dark", "light"]) {
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setTheme(page, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
  } catch {
    /* keep going for screenshot */
  }
  await muteAudio(page);
  const file = path.join(
    outDir,
    `${theme}-editor-approved-attached-mobile-390x844.png`,
  );
  await page.screenshot({ path: file, type: "png", fullPage: false });
  const { w, h } = pngSize(file);
  report.ihdr.push({
    file: path.basename(file),
    w,
    h,
    ok: w === 390 && h === 844,
  });
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "gate-only-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      fixtureOnEditor: report.fixtureOnEditor,
      gate: report.recordingGateStatus,
      gateFlags: report.gate,
      arm: report.consciousArm.status,
      theme: report.themeRoundTrip?.status,
      ihdrOk: report.ihdr.every((x) => x.ok),
    },
    null,
    2,
  ),
);
