/**
 * Mocked REC attempt on APPROVED (not PUBLISHED) attached fixture.
 * Harness-only MediaRecorder mock. No Play/export/delete. No DB take insert.
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
const webmB64 = fs
  .readFileSync(
    path.resolve("src/lib/beats/fixtures/chromium-mediarecorder-opus.webm"),
  )
  .toString("base64");

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

const report = {
  capturedAt: new Date().toISOString(),
  fixtureExpectedStatus: "APPROVED",
  phases: [],
  status: "NOT_RUN",
  ihdr: [],
};

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  permissions: ["microphone"],
});
await context.addInitScript(
  ({ b64 }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const silentBlob = new Blob([bytes], { type: "audio/webm;codecs=opus" });
    class FakeMediaRecorder {
      static isTypeSupported(type) {
        return String(type).startsWith("audio/webm");
      }
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable = null;
      onstop = null;
      onerror = null;
      constructor(_stream, opts) {
        if (opts?.mimeType) this.mimeType = opts.mimeType;
      }
      start() {
        this.state = "recording";
      }
      requestData() {
        if (typeof this.ondataavailable === "function") {
          this.ondataavailable({ data: silentBlob });
        }
      }
      stop() {
        this.state = "inactive";
        if (typeof this.ondataavailable === "function") {
          this.ondataavailable({ data: silentBlob });
        }
        if (typeof this.onstop === "function") this.onstop();
      }
      pause() {}
      resume() {}
    }
    window.MediaRecorder = FakeMediaRecorder;
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    }
    navigator.mediaDevices.getUserMedia = async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      return dest.stream;
    };
  },
  { b64: webmB64 },
);

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

// Re-select fixture to be sure
await page
  .locator('[data-testid="studio-transport-choose-beat"], button[aria-label="Zmień bit"]')
  .first()
  .click({ force: true });
const dialog = page.getByRole("dialog", { name: /Wybierz bit/i });
await dialog.waitFor({ state: "visible", timeout: 15000 });
await dialog.getByRole("button", { name: "Moje", exact: true }).click();
await page.waitForTimeout(500);
await dialog.locator("ul li button", { hasText: FIXTURE }).first().click();
await dialog.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
await muteAudio(page);
report.phases.push("fixture-selected");

// Conscious R
const rButtons = page.locator("button", { hasText: /^R$/ });
const nR = await rButtons.count();
for (let i = 0; i < nR; i++) {
  if ((await rButtons.nth(i).getAttribute("aria-pressed")) !== "true") {
    await rButtons.nth(i).click({ force: true });
    break;
  }
}
await page.waitForTimeout(400);
const armed = await page.evaluate(() =>
  [...document.querySelectorAll("button")].some(
    (b) =>
      (b.textContent || "").trim() === "R" &&
      b.getAttribute("aria-pressed") === "true",
  ),
);
report.consciousArm = armed ? "PASS" : "FAIL";
report.phases.push("r-arm");

await page
  .locator(
    '[data-testid="studio-transport"] button[aria-label="Nagraj — otwiera panel nagrywania"]',
  )
  .click({ force: true });
await page.waitForTimeout(600);
const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
await panel.waitFor({ state: "visible", timeout: 10000 });
let panelText = await panel.innerText();
report.panelBeforePrep = panelText.slice(0, 700);
report.gateBeforePrep = /opublikowanych bitów/i.test(panelText);

async function clickInPanel(nameRe) {
  const inPanel = panel.getByRole("button", { name: nameRe });
  if ((await inPanel.count()) > 0) {
    await inPanel.first().click({ force: true });
    return true;
  }
  return false;
}

const prepped = await clickInPanel(/Przygotuj mikrofon/i);
report.phases.push(prepped ? "prep-clicked" : "prep-missing");
await page.waitForTimeout(2500);
panelText = await panel.innerText();
report.panelAfterPrep = panelText.slice(0, 900);
report.gateAfterPrep = /opublikowanych bitów/i.test(panelText);
report.micReady = /Mikrofon gotowy|●\s*Nagraj/i.test(panelText);
report.alertText = await panel
  .locator('[role="alert"]')
  .first()
  .innerText()
  .catch(() => null);

const started = await clickInPanel(/● Nagraj/i);
if (!started) {
  report.status = report.gateAfterPrep ? "BLOCKED" : "NOT_VERIFIED";
  report.defect = report.gateAfterPrep
    ? "product-gate-published-only"
    : "nagraj-missing-after-prep";
} else {
  report.phases.push("rec-started");
  await page.waitForTimeout(2000);
  const stopped = await clickInPanel(/■ Zatrzymaj nagrywanie/i);
  if (!stopped) {
    report.status = "NOT_VERIFIED";
    report.defect = "stop-missing";
  } else {
    report.phases.push("rec-stopped");
    try {
      await page.getByText(/Nagranie gotowe/i).waitFor({
        state: "visible",
        timeout: 120000,
      });
      report.phases.push("take-ready-ui");
      const keep = page.getByRole("button", { name: /✓ Zachowaj/i });
      if ((await keep.count()) === 0) {
        report.status = "NOT_VERIFIED";
        report.defect = "zachowaj-missing";
      } else {
        await keep.first().click();
        await page.waitForTimeout(3000);
        report.phases.push("zachowaj-clicked");
        await page.goto(`${base}/account/takes`, {
          waitUntil: "networkidle",
          timeout: 90000,
        });
        await muteAudio(page);
        const body = await page.evaluate(() => document.body.innerText || "");
        const hasTake =
          /nagranie|take|READY|gotow|sekund|\d+\s*s/i.test(body) &&
          !/Jeszcze cicho|Nie masz jeszcze żadnego nagrania/i.test(body);
        report.archiveHasTake = hasTake;
        for (const theme of ["dark", "light"]) {
          const want =
            theme === "light"
              ? page.locator('button[aria-label="Przełącz na jasny motyw"]')
              : page.locator('button[aria-label="Przełącz na ciemny motyw"]');
          if ((await want.count()) > 0) {
            await want.first().click({ force: true });
            await page.waitForTimeout(400);
          }
          const desk = path.join(
            outDir,
            `${theme}-archive-after-take-desktop-1280x800.png`,
          );
          await page.screenshot({ path: desk, type: "png", fullPage: false });
          let s = pngSize(desk);
          report.ihdr.push({
            file: path.basename(desk),
            ...s,
            ok: s.w === 1280 && s.h === 800,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          const mob = path.join(
            outDir,
            `${theme}-archive-after-take-mobile-390x844.png`,
          );
          await page.screenshot({ path: mob, type: "png", fullPage: false });
          s = pngSize(mob);
          report.ihdr.push({
            file: path.basename(mob),
            ...s,
            ok: s.w === 390 && s.h === 844,
          });
          await page.setViewportSize({ width: 1280, height: 800 });
        }
        report.status = hasTake ? "PASS" : "NOT_VERIFIED";
        if (!hasTake) report.defect = "archive-empty-or-unclear";
      }
    } catch {
      report.status = "NOT_VERIFIED";
      report.defect = "take-ready-timeout";
      report.panelFinal = (await panel.innerText().catch(() => "")).slice(0, 800);
    }
  }
}

report.productVsMock = {
  publishBlockedByRightsAttestation: true,
  mockAudioHarness: "initScript FakeMediaRecorder + silent local webm blob",
  mockDoesNotBypassPublishOrRights: true,
};

await browser.close();
fs.writeFileSync(
  path.join(outDir, "mock-rec-on-approved-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      defect: report.defect,
      arm: report.consciousArm,
      gateAfterPrep: report.gateAfterPrep,
      phases: report.phases,
    },
    null,
    2,
  ),
);
process.exit(report.status === "PASS" ? 0 : 1);
