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

function formAlert(page) {
  return page.locator("p.text-destructive, [role='alert']").allInnerTexts();
}

const browser = await chromium.launch({ headless: true });
let context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page = await context.newPage();

try {
  if (!fs.existsSync(WAV)) throw new Error("wav-missing");
  await login(page, owner);
  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  const card = page.locator("li").filter({ hasText: TITLE }).first();
  // Prefer list item structure from account page
  const editBtn = page.getByRole("button", { name: /^Edytuj$/i });
  // Scope to the card containing TITLE
  const scoped = page.locator(`text=${TITLE}`).locator("..").locator("..");
  if ((await card.count()) > 0 && (await card.getByRole("button", { name: /^Edytuj$/i }).count()) > 0) {
    await card.getByRole("button", { name: /^Edytuj$/i }).click();
  } else {
    await editBtn.first().click();
  }
  await page.waitForURL(/\/beats\/upload\?beatId=/, { timeout: 30000 });
  report.steps.push({ step: "edit-open", ok: true });

  await page.locator('input[name="audio"]').setInputFiles(WAV);
  report.steps.push({ step: "file-set", bytes: fs.statSync(WAV).size });

  // Wait uploading/analyzing to finish: either radios or destructive BPM
  const outcome = await page.waitForFunction(
    () => {
      const t = document.body.innerText || "";
      const n = document.querySelectorAll(
        'input[type="radio"][name^="user-upload-bpm"]',
      ).length;
      if (n > 0) return `radios:${n}`;
      if (/data-testid="bpm-uncertainty-unavailable"|BPM niedostęp|nie może/i.test(t) && /BPM/i.test(t)) {
        // keep waiting unless explicit unavailable panel
      }
      const unavail = document.querySelector('[data-testid="bpm-uncertainty-unavailable"]');
      if (unavail) return "unavailable";
      if (/Błąd|nie udało się wgrać|za duży/i.test(t)) return "error";
      return false;
    },
    null,
    { timeout: 180000 },
  );
  const outcomeStr = await outcome.jsonValue();
  report.steps.push({ step: "analyze-outcome", outcomeStr });
  if (!String(outcomeStr).startsWith("radios:")) {
    report.status = "BLOCKED";
    report.defect = "analyze-failed";
    report.alerts = await formAlert(page);
    throw new Error(report.defect);
  }

  await page.locator('input[type="radio"][name^="user-upload-bpm"]').first().check({ force: true });
  await page.locator('input[name="title"]').fill(TITLE);

  const saveBtn = page.getByRole("button", { name: /Zapisz wersję roboczą/i });
  report.steps.push({
    step: "pre-save",
    saveDisabled: await saveBtn.isDisabled(),
  });
  await saveBtn.click();
  await page.waitForTimeout(2000);

  // Wait up to 2 min for success banner or error
  await page.waitForFunction(
    () => {
      const t = document.body.innerText || "";
      if (/Wersja robocza zapisana/i.test(t)) return "saved";
      const err = document.querySelector("p.text-destructive");
      if (err && (err.textContent || "").trim().length > 3) return "error";
      return false;
    },
    null,
    { timeout: 120000 },
  );
  const saveState = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const err = document.querySelector("p.text-destructive");
    return {
      saved: /Wersja robocza zapisana/i.test(t),
      err: err ? (err.textContent || "").trim().slice(0, 200) : null,
    };
  });
  report.steps.push({ step: "save", ...saveState });
  if (!saveState.saved) {
    report.status = "BLOCKED";
    report.defect = "draft-save-error";
    report.saveError = saveState.err;
    throw new Error(report.defect);
  }

  await page
    .locator("label")
    .filter({ hasText: /Oświadczam, że mam prawa do tego nagrania/i })
    .locator('input[type="checkbox"]')
    .check({ force: true });

  const submit = page.getByRole("button", { name: /Wyślij do moderacji/i });
  await page.waitForTimeout(500);
  report.steps.push({ step: "pre-submit", disabled: await submit.isDisabled() });
  if (await submit.isDisabled()) {
    report.status = "BLOCKED";
    report.defect = "submit-disabled-after-ready-save";
    report.alerts = await formAlert(page);
    throw new Error(report.defect);
  }
  await submit.click();

  // Wait navigation OR error
  await Promise.race([
    page.waitForURL(/\/account\/beats/, { timeout: 90000 }),
    page.waitForFunction(
      () => {
        const err = document.querySelector("p.text-destructive");
        return err && (err.textContent || "").trim().length > 5;
      },
      null,
      { timeout: 90000 },
    ),
  ]);
  const after = await page.evaluate(() => ({
    url: location.pathname,
    err: document.querySelector("p.text-destructive")?.textContent?.trim()?.slice(0, 240) || null,
    bodyHasPending: /moderac|oczekuje|przegląd/i.test(document.body.innerText || ""),
  }));
  report.steps.push({ step: "submit-result", ...after });
  if (!after.url.includes("/account/beats")) {
    report.status = "BLOCKED";
    report.defect = "submit-error";
    report.submitError = after.err;
    throw new Error(report.defect);
  }

  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  const row = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("li")].find((n) =>
      (n.textContent || "").includes(t),
    );
    return el ? (el.textContent || "").replace(/\s+/g, " ").slice(0, 240) : null;
  }, TITLE);
  report.ownerRow = row;
  if (!row || /Wersja robocza/i.test(row)) {
    report.status = "BLOCKED";
    report.defect = "row-still-draft";
    throw new Error(report.defect);
  }

  // Moderator
  await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  await login(page, mod);
  await page.goto(`${base}/admin/moderation`, { waitUntil: "networkidle", timeout: 90000 });

  async function openRow() {
    const r = page.locator("li").filter({ hasText: TITLE });
    if ((await r.count()) === 0) return false;
    await r.first().getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i }).click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
    return true;
  }
  if (!(await openRow())) {
    report.status = "BLOCKED";
    report.defect = "not-in-mod-queue";
    throw new Error(report.defect);
  }
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
    report.steps.push({ step: "approved" });
    await page.goto(`${base}/admin/moderation`, { waitUntil: "networkidle", timeout: 90000 });
    if (!(await openRow())) throw new Error("gone-after-approve");
    await closeReviews();
  }
  const pub = page.getByRole("button", { name: /^Opublikuj$/i });
  if ((await pub.count()) === 0) throw new Error("no-publish");
  await pub.first().click();
  await page.waitForTimeout(4000);
  const pubErr = await page.locator('[role="alert"]').innerText().catch(() => "");
  if (pubErr && /nie powiod|oświadcz|praw/i.test(pubErr)) {
    report.status = "BLOCKED";
    report.defect = "publish-failed";
    report.pubErrClass = /oświadcz/i.test(pubErr) ? "ATTESTATION" : "RIGHTS";
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
  path.join(outDir, "replacement-draft-ready-submit-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ status: report.status, defect: report.defect, steps: report.steps }, null, 2));
process.exit(report.status === "PASS" ? 0 : 1);
