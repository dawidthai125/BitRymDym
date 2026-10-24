/**
 * Open DRAFT via Edytuj, re-upload WAV if needed, save READY, attest, submit,
 * then staff approve+publish. No SQL status patches.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const TITLE = "Visual Fixture — Published Local Only";
const WAV = path.join(outDir, "_local-soft-click-4s.wav");
const owner = JSON.parse(fs.readFileSync(process.env.CREDS_OWNER, "utf8"));
const mod = JSON.parse(fs.readFileSync(process.env.CREDS_MOD, "utf8"));
const base = owner.base;

const report = { capturedAt: new Date().toISOString(), steps: [], status: "NOT_RUN" };

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

const browser = await chromium.launch({ headless: true });
let context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page = await context.newPage();

try {
  await login(page, owner);
  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  await mute(page);

  const card = page.locator("li, article, section, div").filter({ hasText: TITLE }).first();
  await card.getByRole("button", { name: /^Edytuj$/i }).click();
  await page.waitForURL(/\/beats\/upload/, { timeout: 30000 });
  await mute(page);
  report.steps.push({ step: "open-edit", urlHasBeatId: page.url().includes("beatId=") });

  // Always re-upload to ensure READY master via normal UI path
  await page.locator('input[name="audio"]').setInputFiles(WAV);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('input[type="radio"][name^="user-upload-bpm"]').length >
        0 || /niedostęp|UNAVAILABLE/i.test(document.body.innerText || ""),
    null,
    { timeout: 180000 },
  );
  const radioCount = await page
    .locator('input[type="radio"][name^="user-upload-bpm"]')
    .count();
  report.steps.push({ step: "reanalyze", radioCount });
  if (radioCount === 0) {
    report.status = "BLOCKED";
    report.defect = "bpm-unavailable-on-reedit";
    throw new Error(report.defect);
  }
  await page.locator('input[type="radio"][name^="user-upload-bpm"]').first().check({ force: true });
  await page.locator('input[name="title"]').fill(TITLE);

  const save = page.getByRole("button", { name: /Zapisz wersję roboczą/i });
  await save.click();
  await page.waitForFunction(
    () => /Wersja robocza zapisana|audio gotowe/i.test(document.body.innerText || ""),
    null,
    { timeout: 120000 },
  );
  report.steps.push({ step: "draft-saved-ready", ok: true });

  const rights = page.locator("label").filter({
    hasText: /Oświadczam, że mam prawa do tego nagrania/i,
  });
  await rights.locator('input[type="checkbox"]').check({ force: true });

  const submit = page.getByRole("button", { name: /Wyślij do moderacji/i });
  await page.waitForFunction(
    () => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => /Wyślij do moderacji/i.test(x.textContent || ""));
      return b && !b.disabled;
    },
    null,
    { timeout: 15000 },
  );
  await submit.click();
  await page.waitForURL(/\/account\/beats/, { timeout: 90000 });
  await mute(page);
  const after = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("li, article, div")].find((n) =>
      (n.textContent || "").includes(t),
    );
    return el ? (el.textContent || "").replace(/\s+/g, " ").slice(0, 240) : null;
  }, TITLE);
  report.steps.push({ step: "submitted", rowHint: after });
  if (!after || /Wersja robocza/i.test(after)) {
    const alert = await page.locator('[role="alert"]').innerText().catch(() => null);
    report.status = "BLOCKED";
    report.defect = "still-draft-after-submit";
    report.submitAlert = alert;
    throw new Error(report.defect);
  }

  await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  await login(page, mod);
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await mute(page);

  let row = page.locator("li").filter({ hasText: TITLE });
  if ((await row.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "not-in-moderation-after-submit";
    throw new Error(report.defect);
  }
  await row.first().getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i }).click();
  await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });

  async function closeReviews() {
    for (let i = 0; i < 6; i++) {
      const close = page.getByRole("button", { name: /Zamknij sprawę/i });
      if ((await close.count()) === 0) break;
      await close.first().click();
      await page.waitForTimeout(1200);
      report.steps.push({ step: "closed-review" });
    }
  }
  await closeReviews();

  const approve = page.getByRole("button", { name: /^Zatwierdź$/i });
  if ((await approve.count()) > 0) {
    await approve.first().click();
    await page.waitForTimeout(2500);
    report.steps.push({ step: "approved" });
    await page.goto(`${base}/admin/moderation`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    row = page.locator("li").filter({ hasText: TITLE });
    await row.first().getByRole("link", { name: /Opublikuj/i }).click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
    await closeReviews();
  }

  const publish = page.getByRole("button", { name: /^Opublikuj$/i });
  if ((await publish.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "publish-missing";
    throw new Error(report.defect);
  }
  await publish.first().click();
  await page.waitForTimeout(4000);
  const alert = await page.locator('[role="alert"]').innerText().catch(() => "");
  if (alert && /nie powiod|oświadcz|praw/i.test(alert)) {
    report.status = "BLOCKED";
    report.defect = "publish-rejected";
    report.errorClass = /oświadcz/i.test(alert) ? "ATTESTATION" : "RIGHTS";
    throw new Error(report.defect);
  }
  report.status = "PASS";
  report.steps.push({ step: "published" });
} catch (e) {
  if (report.status === "NOT_RUN") report.status = "FAIL";
  report.defect = report.defect || String(e?.message || e).slice(0, 220);
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "replacement-finish-publish-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    status: report.status,
    defect: report.defect,
    steps: report.steps.map((s) => s.step),
  }),
);
process.exit(report.status === "PASS" ? 0 : 1);
