import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const TITLE = "Visual Fixture — Published Local Only";
const owner = JSON.parse(fs.readFileSync(process.env.CREDS_OWNER, "utf8"));
const mod = JSON.parse(fs.readFileSync(process.env.CREDS_MOD, "utf8"));
const base = owner.base;
const report = { capturedAt: new Date().toISOString(), steps: [] };

async function login(page, creds) {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByLabel(/e-mail/i).fill(creds.email);
  await page.getByLabel(/hasło|password/i).fill(creds.password);
  await page.getByRole("button", { name: /zaloguj/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60000 });
}

const browser = await chromium.launch({ headless: true });
let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page = await ctx.newPage();

try {
  await login(page, owner);
  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  const card = page.locator("li").filter({ hasText: TITLE }).first();
  report.row = (await card.innerText()).replace(/\s+/g, " ").slice(0, 220);
  const osw = card.getByRole("button", { name: /Oświadczenie i wysyłka/i });
  if ((await osw.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "no-oswiadczenie-btn";
    throw new Error(report.defect);
  }
  await osw.click();
  await page.waitForURL(/\/beats\/upload\?beatId=/, { timeout: 30000 });
  await page
    .locator("label")
    .filter({ hasText: /Oświadczam, że mam prawa do tego nagrania/i })
    .locator('input[type="checkbox"]')
    .check({ force: true });
  const submit = page.getByRole("button", { name: /Wyślij do moderacji/i });
  report.submitDisabled = await submit.isDisabled();
  await submit.click();
  await Promise.race([
    page.waitForURL(/\/account\/beats/, { timeout: 90000 }),
    page.waitForFunction(
      () => {
        const err = document.querySelector("p.text-destructive");
        return Boolean(err && (err.textContent || "").trim().length > 5);
      },
      null,
      { timeout: 90000 },
    ),
  ]);
  report.err = await page.locator("p.text-destructive").innerText().catch(() => null);
  report.urlAfter = page.url();
  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  report.finalRow = (
    await page.locator("li").filter({ hasText: TITLE }).first().innerText()
  )
    .replace(/\s+/g, " ")
    .slice(0, 220);
  if (/Wersja robocza/i.test(report.finalRow) || report.err) {
    report.status = "BLOCKED";
    report.defect = report.err ? "submit-error" : "still-draft";
    throw new Error(report.defect);
  }
  report.steps.push("submitted");

  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  await login(page, mod);
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  const row = page.locator("li").filter({ hasText: TITLE });
  if ((await row.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "mod-missing";
    throw new Error(report.defect);
  }
  await row.first().getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i }).click();
  await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
  for (let i = 0; i < 6; i++) {
    const c = page.getByRole("button", { name: /Zamknij sprawę/i });
    if ((await c.count()) === 0) break;
    await c.first().click();
    await page.waitForTimeout(1000);
  }
  if ((await page.getByRole("button", { name: /^Zatwierdź$/i }).count()) > 0) {
    await page.getByRole("button", { name: /^Zatwierdź$/i }).click();
    await page.waitForTimeout(2500);
    report.steps.push("approved");
    await page.goto(`${base}/admin/moderation`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page
      .locator("li")
      .filter({ hasText: TITLE })
      .first()
      .getByRole("link", { name: /Opublikuj/i })
      .click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
    for (let i = 0; i < 6; i++) {
      const c = page.getByRole("button", { name: /Zamknij sprawę/i });
      if ((await c.count()) === 0) break;
      await c.first().click();
      await page.waitForTimeout(1000);
    }
  }
  await page.getByRole("button", { name: /^Opublikuj$/i }).click();
  await page.waitForTimeout(4000);
  const alert = await page.locator('[role="alert"]').innerText().catch(() => "");
  if (alert && /nie powiod|oświadcz|praw/i.test(alert)) {
    report.status = "BLOCKED";
    report.defect = "publish-failed";
    report.alertClass = /oświadcz/i.test(alert) ? "ATTESTATION" : "RIGHTS";
    throw new Error(report.defect);
  }
  report.status = "PASS";
  report.steps.push("published");
} catch (e) {
  report.status = report.status || "FAIL";
  report.defect = report.defect || String(e?.message || e).slice(0, 200);
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "replacement-submit-now-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "PASS" ? 0 : 1);
