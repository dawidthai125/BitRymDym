/**
 * Focused retry: capture recording panel text + gate; finish mobile shots + theme RT.
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

async function clickMotywTo(page, theme) {
  const label =
    theme === "light"
      ? 'button[aria-label="Przełącz na jasny motyw"]'
      : 'button[aria-label="Przełącz na ciemny motyw"]';
  await page.locator(label).first().click({ force: true });
  await page.waitForTimeout(500);
}

async function assertTheme(page, expected) {
  const actual = await page.evaluate((key) => {
    const root = document.documentElement;
    return {
      storage: localStorage.getItem(key),
      dataTheme: root.getAttribute("data-theme"),
      hasDark: root.classList.contains("dark"),
    };
  }, KEY);
  const ok =
    actual.storage === expected &&
    actual.dataTheme === expected &&
    actual.hasDark === (expected === "dark");
  return { ok, actual };
}

const report = { capturedAt: new Date().toISOString() };
const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();

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

// Ensure fixture title visible / attach
const body0 = await page.evaluate(() => document.body.innerText || "");
if (!body0.includes(FIXTURE)) {
  await page.getByRole("button", { name: /\+?\s*Wybierz bit|Zmień bit/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /Wybierz bit/i });
  await dialog.getByRole("button", { name: "Moje", exact: true }).click();
  await dialog.locator("ul li button", { hasText: FIXTURE }).first().click();
  await page.waitForTimeout(1200);
}

// Open recording surfaces
for (const name of [/^RECORD$/i, /^Nagrywanie$/i, /^REC$/i]) {
  const b = page.getByRole("button", { name });
  if ((await b.count()) > 0) {
    await b.first().click({ force: true });
    await page.waitForTimeout(300);
  }
}
const transportRec = page.locator(
  '[data-testid="studio-transport"] button',
);
const labels = [];
const n = await transportRec.count();
for (let i = 0; i < Math.min(n, 12); i++) {
  labels.push(await transportRec.nth(i).getAttribute("aria-label"));
}
report.transportAriaLabels = labels.filter(Boolean);

const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
const panelVisible = await panel.isVisible().catch(() => false);
report.panelVisible = panelVisible;
const panelText = panelVisible
  ? (await panel.innerText()).slice(0, 800)
  : null;
report.panelTextSnippet = panelText;
report.gatePatterns = {
  publishedOnly: /opublikowan/i.test(panelText || ""),
  draftOnly: /szkic|DRAFT/i.test(panelText || ""),
  approvedMention: /zatwierdz/i.test(panelText || ""),
  prepareMic: /Przygotuj mikrofon/i.test(panelText || ""),
  nagraj: /●\s*Nagraj|Nagraj/i.test(panelText || ""),
};

// R arm with longer wait
const rButtons = page.locator("button", { hasText: /^R$/ });
const before = [];
const after = [];
const countR = await rButtons.count();
for (let i = 0; i < countR; i++) {
  before.push(await rButtons.nth(i).getAttribute("aria-pressed"));
}
if (countR > 0) {
  await rButtons.first().click({ force: true });
  await page.waitForTimeout(1000);
}
for (let i = 0; i < countR; i++) {
  after.push(await rButtons.nth(i).getAttribute("aria-pressed"));
}
report.consciousArm = {
  before,
  after,
  status: after.some((a) => a === "true") ? "PASS" : "FAIL",
};

// Mobile shots
await page.setViewportSize({ width: 390, height: 844 });
for (const theme of ["dark", "light"]) {
  await clickMotywTo(page, theme === "dark" ? "light" : "dark");
  await clickMotywTo(page, theme);
  await page.waitForTimeout(400);
  const t = await assertTheme(page, theme);
  const file = path.join(
    outDir,
    `${theme}-editor-approved-attached-mobile-390x844.png`,
  );
  await page.screenshot({ path: file, type: "png", fullPage: false });
  const { w, h } = pngSize(file);
  report[`mobile_${theme}`] = { themeOk: t.ok, ihdr: { w, h, ok: w === 390 && h === 844 } };
}

// Theme round trip
await page.setViewportSize({ width: 1280, height: 800 });
await clickMotywTo(page, "light");
await page.waitForTimeout(400);
let rt = await assertTheme(page, "light");
await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
rt = await assertTheme(page, "light");
await page.goto(`${base}/studio/p/${projectId}`, {
  waitUntil: "networkidle",
  timeout: 90000,
});
await muteAudio(page);
rt = await assertTheme(page, "light");
await page.reload({ waitUntil: "networkidle" });
rt = await assertTheme(page, "light");
await clickMotywTo(page, "dark");
await page.waitForTimeout(400);
await page.reload({ waitUntil: "networkidle" });
const darkRt = await assertTheme(page, "dark");
report.themeRoundTrip = {
  status: darkRt.ok && rt.ok ? "PASS" : "FAIL",
  final: darkRt.actual,
};

await browser.close();
fs.writeFileSync(
  path.join(outDir, "gate-retry-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      panelVisible: report.panelVisible,
      gate: report.gatePatterns,
      arm: report.consciousArm.status,
      theme: report.themeRoundTrip.status,
      transportLabels: report.transportAriaLabels?.length,
    },
    null,
    2,
  ),
);
