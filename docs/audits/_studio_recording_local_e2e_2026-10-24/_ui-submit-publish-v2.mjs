/**
 * From existing DRAFT (upload?beatId): attest+submit with error capture,
 * then mod publish. No SQL.
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
  const card = page.locator("li, article, section, div").filter({ hasText: TITLE }).first();
  // Prefer Oświadczenie if present
  const send = card.getByRole("button", { name: /Oświadczenie i wysyłka/i });
  const edit = card.getByRole("button", { name: /^Edytuj$/i });
  if ((await send.count()) > 0) {
    await send.first().click();
  } else {
    await edit.first().click();
  }
  await page.waitForURL(/\/beats\/upload/, { timeout: 30000 });
  await mute(page);

  // Ensure READY draft
  const alreadyReady = await page.evaluate(() =>
    /Audio jest już gotowe|Wersja robocza zapisana/i.test(document.body.innerText || ""),
  );
  report.steps.push({ step: "upload-open", alreadyReady });

  if (!alreadyReady) {
    await page.locator('input[name="audio"]').setInputFiles(WAV);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('input[type="radio"][name^="user-upload-bpm"]')
          .length > 0,
      null,
      { timeout: 180000 },
    );
    await page.locator('input[type="radio"][name^="user-upload-bpm"]').first().check({ force: true });
    await page.locator('input[name="title"]').fill(TITLE);
    await page.getByRole("button", { name: /Zapisz wersję roboczą/i }).click();
    await page.waitForFunction(
      () => /Wersja robocza zapisana|audio gotowe/i.test(document.body.innerText || ""),
      null,
      { timeout: 120000 },
    );
  } else {
    await page.locator('input[name="title"]').fill(TITLE);
  }

  await page
    .locator("label")
    .filter({ hasText: /Oświadczam, że mam prawa do tego nagrania/i })
    .locator('input[type="checkbox"]')
    .check({ force: true });

  const submit = page.getByRole("button", { name: /Wyślij do moderacji/i });
  const disabled = await submit.isDisabled();
  report.steps.push({ step: "pre-submit", disabled });
  await submit.click({ force: true });
  await page.waitForTimeout(5000);

  const url = page.url();
  const alert = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  const body = await page.evaluate(() => document.body.innerText || "");
  report.steps.push({
    step: "post-submit",
    urlKind: url.includes("/account/beats")
      ? "account-beats"
      : url.includes("/beats/upload")
        ? "upload"
        : "other",
    alerts: alert.map((a) => a.slice(0, 200)),
    hasPendingCopy: /moderac|oczekuje|przegląd|PENDING/i.test(body),
    stillDraftCopy: /Wersja robocza zapisana/i.test(body),
  });

  if (!url.includes("/account/beats") && alert.length === 0) {
    // wait a bit more for transition
    await page.waitForTimeout(5000);
  }

  if (!page.url().includes("/account/beats")) {
    // Navigate and inspect status
    await page.goto(`${base}/account/beats`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
  }
  const rowHint = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("li, article, div")].find((n) =>
      (n.textContent || "").includes(t),
    );
    return el ? (el.textContent || "").replace(/\s+/g, " ").slice(0, 280) : null;
  }, TITLE);
  report.ownerRowAfter = rowHint;

  const pending =
    rowHint &&
    /moderac|oczekuje|przegląd|W moderacji|PENDING/i.test(rowHint) &&
    !/Wersja robocza/i.test(rowHint);

  if (!pending) {
    report.status = "BLOCKED";
    report.defect = "submit-did-not-reach-pending";
    throw new Error(report.defect + " :: " + (alert[0] || rowHint || "").slice(0, 120));
  }
  report.steps.push({ step: "pending-confirmed" });

  await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  await login(page, mod);
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });

  async function openTitle() {
    const row = page.locator("li").filter({ hasText: TITLE });
    if ((await row.count()) === 0) return false;
    await row.first().getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i }).click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
    return true;
  }
  if (!(await openTitle())) {
    report.status = "BLOCKED";
    report.defect = "mod-queue-missing";
    throw new Error(report.defect);
  }

  async function closeReviews() {
    for (let i = 0; i < 6; i++) {
      const close = page.getByRole("button", { name: /Zamknij sprawę/i });
      if ((await close.count()) === 0) break;
      await close.first().click();
      await page.waitForTimeout(1200);
    }
  }
  await closeReviews();

  if ((await page.getByRole("button", { name: /^Zatwierdź$/i }).count()) > 0) {
    await page.getByRole("button", { name: /^Zatwierdź$/i }).click();
    await page.waitForTimeout(2500);
    report.steps.push({ step: "approved" });
    await page.goto(`${base}/admin/moderation`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    if (!(await openTitle())) {
      report.status = "BLOCKED";
      report.defect = "missing-after-approve";
      throw new Error(report.defect);
    }
    await closeReviews();
  }

  const publish = page.getByRole("button", { name: /^Opublikuj$/i });
  if ((await publish.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "no-publish";
    throw new Error(report.defect);
  }
  await publish.first().click();
  await page.waitForTimeout(4000);
  const pubAlert = await page.locator('[role="alert"]').innerText().catch(() => "");
  if (pubAlert && /nie powiod|oświadcz|praw/i.test(pubAlert)) {
    report.status = "BLOCKED";
    report.defect = "publish-failed";
    report.errorClass = /oświadcz/i.test(pubAlert) ? "ATTESTATION" : "RIGHTS";
    throw new Error(report.defect);
  }
  report.status = "PASS";
  report.steps.push({ step: "published" });
} catch (e) {
  if (report.status === "NOT_RUN") report.status = "FAIL";
  report.defect = report.defect || String(e?.message || e).slice(0, 240);
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "replacement-submit-publish-v2-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    status: report.status,
    defect: report.defect,
    ownerRowAfter: report.ownerRowAfter,
    steps: report.steps,
  }, null, 2),
);
process.exit(report.status === "PASS" ? 0 : 1);
