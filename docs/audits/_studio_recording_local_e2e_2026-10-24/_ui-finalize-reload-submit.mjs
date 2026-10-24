/**
 * Finalize on edit page, reload to confirm masterAlreadyReady UI,
 * then attest+submit+mod+publish.
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
  const card = page.locator("li").filter({ hasText: TITLE }).first();
  await card.getByRole("button", { name: /^Edytuj$/i }).click();
  await page.waitForURL(/\/beats\/upload\?beatId=/, { timeout: 30000 });
  const editUrl = page.url();
  report.steps.push({ step: "edit", hasBeatId: editUrl.includes("beatId=") });

  await page.locator('input[name="audio"]').setInputFiles(WAV);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('input[type="radio"][name^="user-upload-bpm"]').length > 0,
    null,
    { timeout: 180000 },
  );
  await page.locator('input[type="radio"][name^="user-upload-bpm"]').first().check({ force: true });
  await page.locator('input[name="title"]').fill(TITLE);

  // Listen for finalize action response via console? Instead wait for banner then reload
  await page.getByRole("button", { name: /Zapisz wersję roboczą/i }).click();

  // Prefer waiting for submit to enable after save, or error text
  const saveResult = await page.waitForFunction(
    () => {
      const t = document.body.innerText || "";
      const err = [...document.querySelectorAll("p.text-destructive")]
        .map((e) => e.textContent || "")
        .join(" ")
        .trim();
      const submit = [...document.querySelectorAll("button")].find((b) =>
        /Wyślij do moderacji/i.test(b.textContent || ""),
      );
      const banner = /Wersja robocza zapisana · audio gotowe/i.test(t);
      if (err && err.length > 5 && !banner) return `ERR:${err.slice(0, 160)}`;
      if (banner) return "BANNER";
      return false;
    },
    null,
    { timeout: 120000 },
  );
  report.steps.push({ step: "save-wait", result: await saveResult.jsonValue() });

  // Reload same edit URL — server should show masterAlreadyReady
  await page.goto(editUrl, { waitUntil: "networkidle", timeout: 90000 });
  await mute(page);
  const reloadState = await page.evaluate(() => {
    const t = document.body.innerText || "";
    return {
      audioReadyCopy: /Audio jest już gotowe/i.test(t),
      oswiadczenieVisible: [...document.querySelectorAll("button")].some((b) =>
        /Oświadczenie|Wyślij do moderacji/i.test(b.textContent || ""),
      ),
      submitDisabled: (() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          /Wyślij do moderacji/i.test(x.textContent || ""),
        );
        return b ? b.disabled : null;
      })(),
    };
  });
  report.steps.push({ step: "reload-state", ...reloadState });

  if (!reloadState.audioReadyCopy) {
    // Try one more finalize cycle
    await page.locator('input[name="audio"]').setInputFiles(WAV);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('input[type="radio"][name^="user-upload-bpm"]').length > 0,
      null,
      { timeout: 180000 },
    );
    await page.locator('input[type="radio"][name^="user-upload-bpm"]').first().check({ force: true });
    await page.locator('input[name="title"]').fill(TITLE);
    await page.getByRole("button", { name: /Zapisz wersję roboczą/i }).click();
    await page.waitForFunction(
      () => /Wersja robocza zapisana · audio gotowe/i.test(document.body.innerText || ""),
      null,
      { timeout: 120000 },
    );
    await page.goto(editUrl, { waitUntil: "networkidle", timeout: 90000 });
    const again = await page.evaluate(() =>
      /Audio jest już gotowe/i.test(document.body.innerText || ""),
    );
    report.steps.push({ step: "second-finalize-reload", audioReadyCopy: again });
    if (!again) {
      report.status = "BLOCKED";
      report.defect = "master-not-ready-after-finalize-reload";
      throw new Error(report.defect);
    }
  }

  // From account beats use Oświadczenie button if present
  await page.goto(`${base}/account/beats`, { waitUntil: "networkidle", timeout: 90000 });
  const card2 = page.locator("li").filter({ hasText: TITLE }).first();
  const rowText = await card2.innerText();
  report.steps.push({ step: "account-row", hint: rowText.replace(/\s+/g, " ").slice(0, 200) });
  const osw = card2.getByRole("button", { name: /Oświadczenie i wysyłka/i });
  if ((await osw.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "oswiadczenie-button-missing-master-flag";
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
  report.steps.push({ step: "submit-enabled", disabled: await submit.isDisabled() });
  await submit.click();
  await page.waitForURL(/\/account\/beats/, { timeout: 90000 });
  const afterRow = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("li")].find((n) =>
      (n.textContent || "").includes(t),
    );
    return el ? (el.textContent || "").replace(/\s+/g, " ").slice(0, 200) : null;
  }, TITLE);
  report.steps.push({ step: "after-submit-row", hint: afterRow });
  if (!afterRow || /Wersja robocza/i.test(afterRow)) {
    report.status = "BLOCKED";
    report.defect = "still-draft";
    throw new Error(report.defect);
  }

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
    report.defect = "not-in-queue";
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
    await page.goto(`${base}/admin/moderation`, { waitUntil: "networkidle", timeout: 90000 });
    if (!(await openRow())) throw new Error("missing-after-approve");
    await closeReviews();
    report.steps.push({ step: "approved" });
  }
  await page.getByRole("button", { name: /^Opublikuj$/i }).click();
  await page.waitForTimeout(4000);
  const pubErr = await page.locator('[role="alert"]').innerText().catch(() => "");
  if (pubErr && /nie powiod|oświadcz|praw/i.test(pubErr)) {
    report.status = "BLOCKED";
    report.defect = "publish-failed";
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
  path.join(outDir, "replacement-finalize-reload-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ status: report.status, defect: report.defect, steps: report.steps }, null, 2));
process.exit(report.status === "PASS" ? 0 : 1);
