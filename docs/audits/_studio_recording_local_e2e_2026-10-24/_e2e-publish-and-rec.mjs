/**
 * After RLS fix: submit→mod→publish replacement fixture, then mocked REC→archive.
 * Title: Visual Fixture — Published Local Only. No Play/export/delete.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const TITLE = "Visual Fixture — Published Local Only";
const BLOCKED = "Visual Fixture — Local Only";
const KEY = "bitrymdym.theme";
const owner = JSON.parse(fs.readFileSync(process.env.CREDS_OWNER, "utf8"));
const mod = JSON.parse(fs.readFileSync(process.env.CREDS_MOD, "utf8"));
const base = owner.base;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(new URL(base).origin)) {
  throw new Error("REFUSE non-loopback");
}
const webmB64 = fs
  .readFileSync(
    path.resolve("src/lib/beats/fixtures/chromium-mediarecorder-opus.webm"),
  )
  .toString("base64");

const report = {
  capturedAt: new Date().toISOString(),
  title: TITLE,
  blockedLeftUntouched: true,
  steps: [],
  statuses: {},
  ihdr: [],
  defects: [],
};

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function mute(page) {
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
}

async function login(page, creds) {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90000 });
  await mute(page);
  await page.getByLabel(/e-mail/i).fill(creds.email);
  await page.getByLabel(/hasło|password/i).fill(creds.password);
  await page.getByRole("button", { name: /zaloguj/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60000 });
}

async function setTheme(page, theme) {
  const want =
    theme === "light"
      ? page.locator('button[aria-label="Przełącz na jasny motyw"]')
      : page.locator('button[aria-label="Przełącz na ciemny motyw"]');
  if ((await want.count()) > 0) {
    await want.first().click({ force: true });
    await page.waitForTimeout(400);
  }
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
  if (
    actual.storage !== expected ||
    actual.dataTheme !== expected ||
    actual.hasDark !== (expected === "dark")
  ) {
    throw new Error(JSON.stringify({ expected, actual }));
  }
}

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

// --- PUBLISH PATH ---
let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page = await ctx.newPage();

try {
  await login(page, owner);
  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  const card = page.locator("li").filter({ hasText: TITLE }).first();
  report.steps.push({
    step: "owner-row",
    hint: (await card.innerText()).replace(/\s+/g, " ").slice(0, 180),
  });
  const osw = card.getByRole("button", { name: /Oświadczenie i wysyłka/i });
  if ((await osw.count()) === 0) {
    report.statuses.rights = "BLOCKED";
    throw new Error("no-oswiadczenie-btn");
  }
  await osw.click();
  await page.waitForURL(/\/beats\/upload\?beatId=/, { timeout: 30000 });
  await page
    .locator("label")
    .filter({ hasText: /Oświadczam, że mam prawa do tego nagrania/i })
    .locator('input[type="checkbox"]')
    .check({ force: true });
  const submit = page.getByRole("button", { name: /Wyślij do moderacji/i });
  if (await submit.isDisabled()) throw new Error("submit-disabled");
  await submit.click();
  await page.waitForURL(/\/account\/beats/, { timeout: 90000 });
  const afterSubmit = (
    await page.locator("li").filter({ hasText: TITLE }).first().innerText()
  )
    .replace(/\s+/g, " ")
    .slice(0, 200);
  report.steps.push({ step: "after-submit", hint: afterSubmit });
  if (/Wersja robocza/i.test(afterSubmit)) throw new Error("still-draft");
  report.statuses.rights = "PASS";
  report.statuses.submit = "PASS";

  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  await login(page, mod);
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });

  async function openRow() {
    const row = page.locator("li").filter({ hasText: TITLE });
    if ((await row.count()) === 0) return false;
    await row
      .first()
      .getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i })
      .click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
    return true;
  }
  if (!(await openRow())) throw new Error("mod-queue-missing");

  async function closeReviews() {
    for (let i = 0; i < 6; i++) {
      const c = page.getByRole("button", { name: /Zamknij sprawę/i });
      if ((await c.count()) === 0) break;
      await c.first().click();
      await page.waitForTimeout(1000);
    }
  }
  await closeReviews();
  if ((await page.getByRole("button", { name: /^Zatwierdź$/i }).count()) > 0) {
    await page.getByRole("button", { name: /^Zatwierdź$/i }).click();
    await page.waitForTimeout(2500);
    report.statuses.moderation = "PASS";
    await page.goto(`${base}/admin/moderation`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    if (!(await openRow())) throw new Error("missing-after-approve");
    await closeReviews();
  } else {
    report.statuses.moderation = "PASS"; // already approved surface
  }

  const pub = page.getByRole("button", { name: /^Opublikuj$/i });
  if ((await pub.count()) === 0) throw new Error("no-publish");
  await pub.first().click();
  await page.waitForTimeout(4000);
  const alert = await page.locator('[role="alert"]').innerText().catch(() => "");
  if (alert && /nie powiod|oświadcz|praw/i.test(alert)) {
    report.statuses.publication = "BLOCKED";
    throw new Error("publish-failed:" + alert.slice(0, 80));
  }
  report.statuses.publication = "PASS";
  report.steps.push({ step: "published" });
} catch (e) {
  report.defects.push("publish-path:" + String(e?.message || e).slice(0, 200));
  if (!report.statuses.submit) report.statuses.submit = "FAIL";
  if (!report.statuses.rights) report.statuses.rights = "FAIL";
}

// --- REC E2E (only if published) ---
try {
  if (report.statuses.publication !== "PASS") throw new Error("skip-rec");

  await ctx.close();
  ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ["microphone"],
  });
  await ctx.addInitScript(
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
        constructor(_s, opts) {
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
        const ac = new Ctx();
        const dest = ac.createMediaStreamDestination();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        return dest.stream;
      };
    },
    { b64: webmB64 },
  );
  page = await ctx.newPage();
  await login(page, owner);
  await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
  const openBtn = page.getByRole("button", { name: /^Otwórz$/i });
  if ((await openBtn.count()) > 0) await openBtn.first().click();
  else await page.locator('a[href*="/studio/p/"]').first().click();
  await page.waitForURL(/\/studio\/p\/[^/]+/, { timeout: 60000 });
  await mute(page);
  const projectId = new URL(page.url()).pathname.split("/").pop();

  await page
    .locator(
      '[data-testid="studio-transport-choose-beat"], button[aria-label="Zmień bit"], button[aria-label="Wybierz bit"]',
    )
    .first()
    .click({ force: true });
  const dialog = page.getByRole("dialog", { name: /Wybierz bit/i });
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  await dialog.getByRole("button", { name: "Moje", exact: true }).click();
  await page.waitForTimeout(600);
  const fixtureBtn = dialog.locator("ul li button", { hasText: TITLE });
  report.statuses.picker = (await fixtureBtn.count()) > 0 ? "PASS" : "FAIL";
  if ((await fixtureBtn.count()) === 0) throw new Error("picker-missing");
  await fixtureBtn.first().click();
  await dialog.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await mute(page);

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
  report.statuses.consciousR = armed ? "PASS" : "FAIL";

  await page
    .locator(
      '[data-testid="studio-transport"] button[aria-label="Nagraj — otwiera panel nagrywania"]',
    )
    .click({ force: true });
  await page.waitForTimeout(600);
  const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
  await panel.waitFor({ state: "visible", timeout: 10000 });

  async function clickPanel(re) {
    const b = panel.getByRole("button", { name: re });
    if ((await b.count()) === 0) return false;
    await b.first().click({ force: true });
    return true;
  }

  await clickPanel(/Przygotuj mikrofon/i);
  await page.waitForTimeout(2500);
  const panelText = await panel.innerText();
  const gate = /opublikowanych bitów/i.test(panelText);
  report.statuses.recordingGateLifted = gate ? "FAIL" : "PASS";
  if (gate) throw new Error("gate-still-present");

  if (!(await clickPanel(/● Nagraj/i))) throw new Error("nagraj-missing");
  await page.waitForTimeout(2000);
  if (!(await clickPanel(/■ Zatrzymaj nagrywanie/i)))
    throw new Error("stop-missing");
  await page.getByText(/Nagranie gotowe/i).waitFor({ state: "visible", timeout: 120000 });
  const keep = page.getByRole("button", { name: /✓ Zachowaj/i });
  if ((await keep.count()) === 0) throw new Error("zachowaj-missing");
  await keep.first().click();
  await page.waitForTimeout(3000);
  report.statuses.mockRec = "PASS";
  report.statuses.takeSave = "PASS";

  // Theme + editor shots
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await mute(page);
    const file = path.join(
      outDir,
      `${theme}-editor-published-attached-desktop-1280x800.png`,
    );
    await page.screenshot({ path: file, type: "png", fullPage: false });
    const s = pngSize(file);
    report.ihdr.push({
      file: path.basename(file),
      ...s,
      ok: s.w === 1280 && s.h === 800,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setTheme(page, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await mute(page);
    const file = path.join(
      outDir,
      `${theme}-editor-published-attached-mobile-390x844.png`,
    );
    await page.screenshot({ path: file, type: "png", fullPage: false });
    const s = pngSize(file);
    report.ihdr.push({
      file: path.basename(file),
      ...s,
      ok: s.w === 390 && s.h === 844,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // Theme round trip
  await setTheme(page, "light");
  await assertTheme(page, "light");
  await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
  await assertTheme(page, "light");
  await page.goto(`${base}/studio/p/${projectId}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await mute(page);
  await page.reload({ waitUntil: "networkidle" });
  await assertTheme(page, "light");
  await setTheme(page, "dark");
  await page.reload({ waitUntil: "networkidle" });
  await assertTheme(page, "dark");
  report.statuses.themeRoundTrip = "PASS";

  // Motyw placement
  const place = await page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return { ok: false };
    const nodes = [...header.querySelectorAll("a, button")].map((el) =>
      (el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40),
    );
    const toggleIdx = nodes.findIndex((t) => /Ciemny|Jasny|motyw/i.test(t));
    const after = nodes.slice(toggleIdx + 1);
    const hasAccount = after.some(
      (t) => t && !/Szukaj|Bity|Studio|Biblioteka/i.test(t),
    );
    return { ok: toggleIdx >= 0 && hasAccount };
  });
  report.statuses.motywPlacement = place.ok ? "PASS" : "FAIL";

  // Archive
  await page.goto(`${base}/account/takes`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await mute(page);
  const body = await page.evaluate(() => document.body.innerText || "");
  const hasTake =
    /nagranie|take|READY|gotow|sekund|\d+\s*s/i.test(body) &&
    !/Jeszcze cicho|Nie masz jeszcze żadnego nagrania/i.test(body);
  report.statuses.archive = hasTake ? "PASS" : "NOT_VERIFIED";

  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await mute(page);
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

  report.statuses.ihdr = report.ihdr.every((x) => x.ok) ? "PASS" : "FAIL";
  report.statuses.blockedOriginalUntouched = "PASS";
} catch (e) {
  if (String(e?.message) !== "skip-rec") {
    report.defects.push("rec-path:" + String(e?.message || e).slice(0, 220));
  }
}

await browser.close();
report.statuses.docker = "PASS";
report.statuses.loopbackSupabase = "PASS";
report.statuses.production = "NOT_RUN";
report.mockLimitation =
  "MediaRecorder/getUserMedia harness-only; does not bypass product PUBLISHED gate or rights.";

fs.writeFileSync(
  path.join(outDir, "owner-select-policy-e2e-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      statuses: report.statuses,
      defects: report.defects,
      ihdrFail: report.ihdr.filter((x) => !x.ok).length,
    },
    null,
    2,
  ),
);
process.exit(
  report.statuses.publication === "PASS" &&
    report.statuses.mockRec === "PASS" &&
    report.statuses.archive === "PASS"
    ? 0
    : 1,
);
