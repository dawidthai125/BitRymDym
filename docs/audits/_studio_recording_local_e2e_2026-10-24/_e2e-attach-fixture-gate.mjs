/**
 * Attach Visual Fixture via Zmień bit → Moje, then read recording gate.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const FIXTURE = "Visual Fixture — Local Only";
const creds = JSON.parse(fs.readFileSync(process.env.CREDS_PATH, "utf8"));
const base = creds.base;

async function muteAudio(page) {
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
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

await page
  .locator('[data-testid="studio-transport"] button[aria-label="Zmień bit"]')
  .click({ force: true });
const dialog = page.getByRole("dialog", { name: /Wybierz bit/i });
await dialog.waitFor({ state: "visible", timeout: 15000 });
await dialog.getByRole("button", { name: "Moje", exact: true }).click();
await page.waitForTimeout(700);
const fixtureBtn = dialog.locator("ul li button", { hasText: FIXTURE });
report.pickerCount = await fixtureBtn.count();
report.pickerStatus = report.pickerCount > 0 ? "PASS" : "FAIL";
if (report.pickerCount === 0) {
  report.dialogSnippet = (await dialog.innerText()).slice(0, 500);
} else {
  await fixtureBtn.first().click();
  await dialog.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await muteAudio(page);
}
report.fixtureOnEditor = await page.evaluate(
  (t) => (document.body.innerText || "").includes(t),
  FIXTURE,
);

await page
  .locator(
    '[data-testid="studio-transport"] button[aria-label="Nagraj — otwiera panel nagrywania"]',
  )
  .click({ force: true });
await page.waitForTimeout(800);
const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
report.panelVisible = await panel.isVisible().catch(() => false);
const panelText = report.panelVisible
  ? await panel.innerText()
  : await page.evaluate(() => document.body.innerText || "");
report.panelSnippet = String(panelText).slice(0, 1000);
report.gate = {
  publishedOnlyCopy: /Nagrywanie dostępne tylko dla opublikowanych bitów/i.test(
    panelText,
  ),
  prepareMic: /Przygotuj mikrofon/i.test(panelText),
  nagrajPrimary: /●\s*Nagraj/.test(panelText),
};
report.recordingGateStatus = report.gate.publishedOnlyCopy
  ? "PRESENT_BLOCKING"
  : report.gate.nagrajPrimary
    ? "LIFTED"
    : "NOT_VERIFIED";

// Desktop published-attached naming for APPROVED (not published) evidence
for (const theme of ["dark", "light"]) {
  const label =
    theme === "light"
      ? 'button[aria-label="Przełącz na jasny motyw"]'
      : 'button[aria-label="Przełącz na ciemny motyw"]';
  const cur = await page.evaluate((key) => {
    return document.documentElement.getAttribute("data-theme");
  }, "bitrymdym.theme");
  if (cur !== theme) {
    const btn = page.locator(label);
    if ((await btn.count()) > 0) await btn.first().click({ force: true });
    else {
      // toggle once if opposite label showing
      const other =
        theme === "light"
          ? 'button[aria-label="Przełącz na ciemny motyw"]'
          : 'button[aria-label="Przełącz na jasny motyw"]';
      // if wanting light while dark, button is "jasny"
      const want =
        theme === "light"
          ? page.locator('button[aria-label="Przełącz na jasny motyw"]')
          : page.locator('button[aria-label="Przełącz na ciemny motyw"]');
      if ((await want.count()) > 0) await want.first().click({ force: true });
    }
    await page.waitForTimeout(400);
  }
  await muteAudio(page);
  const file = path.join(
    outDir,
    `${theme}-editor-approved-attached-desktop-1280x800.png`,
  );
  await page.screenshot({ path: file, type: "png", fullPage: false });
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "attach-fixture-gate-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      picker: report.pickerStatus,
      fixtureOnEditor: report.fixtureOnEditor,
      gate: report.recordingGateStatus,
      gateFlags: report.gate,
    },
    null,
    2,
  ),
);
