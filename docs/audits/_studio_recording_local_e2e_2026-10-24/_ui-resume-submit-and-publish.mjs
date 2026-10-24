/**
 * Resume: owner opens account/beats or upload for Published Local Only title,
 * ensure submitted; mod approves+publishes. No status SQL.
 */
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
const WAV = path.join(outDir, "_local-soft-click-4s.wav");

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
  const body = await page.evaluate(() => document.body.innerText || "");
  report.ownerBeatsHasTitle = body.includes(TITLE);
  report.ownerBeatsSnippetKind = /Visual Fixture — Published|Visual Fixture — Local|szkic|DRAFT|moderac|zatwierdz|opublik/i.test(
    body,
  )
    ? "has-keywords"
    : "none";

  // Find link/row for TITLE
  const link = page.locator("a, button, li").filter({ hasText: TITLE });
  report.ownerTitleHits = await link.count();
  if (report.ownerTitleHits > 0) {
    const rowText = await link.first().innerText();
    report.ownerRowHint = rowText.slice(0, 200);
    // If draft / needs submit — open upload with beatId if link goes there
    const href = await link.first().getAttribute("href").catch(() => null);
    if (href) {
      await page.goto(new URL(href, base).toString(), {
        waitUntil: "networkidle",
        timeout: 90000,
      });
    } else {
      await link.first().click();
      await page.waitForTimeout(1500);
    }
    await mute(page);
    report.afterOpenUrlKind = page.url().includes("/beats/upload")
      ? "upload"
      : page.url().includes("/account/beats")
        ? "account-beats"
        : "other";

    // If on upload and can submit
    const submitBtn = page.getByRole("button", { name: /Wyślij do moderacji/i });
    if ((await submitBtn.count()) > 0) {
      const rights = page.locator("label").filter({
        hasText: /Oświadczam, że mam prawa do tego nagrania/i,
      });
      if ((await rights.count()) > 0) {
        const cb = rights.locator('input[type="checkbox"]');
        if (!(await cb.isChecked())) await cb.check({ force: true });
      }
      // May need master already ready — if file needed, re-upload
      if (await submitBtn.isDisabled()) {
        const fileInput = page.locator('input[name="audio"]');
        if ((await fileInput.count()) > 0) {
          // try select bpm + save if draft not ready
          const radios = page.locator(
            'input[type="radio"][name^="user-upload-bpm"]',
          );
          if ((await radios.count()) === 0 && (await fileInput.count()) > 0) {
            await fileInput.setInputFiles(WAV);
            await page.waitForTimeout(5000);
            await page
              .waitForFunction(
                () =>
                  document.querySelectorAll(
                    'input[type="radio"][name^="user-upload-bpm"]',
                  ).length > 0,
                null,
                { timeout: 180000 },
              )
              .catch(() => {});
          }
          if ((await radios.count()) > 0 || (await page.locator('input[type="radio"][name^="user-upload-bpm"]').count()) > 0) {
            await page
              .locator('input[type="radio"][name^="user-upload-bpm"]')
              .first()
              .check({ force: true });
          }
          await page.locator('input[name="title"]').fill(TITLE);
          const save = page.getByRole("button", { name: /Zapisz wersję roboczą/i });
          if ((await save.count()) > 0 && !(await save.isDisabled())) {
            await save.click();
            await page.waitForTimeout(5000);
          }
          if ((await rights.count()) > 0) {
            await rights.locator('input[type="checkbox"]').check({ force: true });
          }
        }
      }
      if (!(await submitBtn.isDisabled())) {
        await submitBtn.click();
        await page.waitForTimeout(4000);
        const alert = await page.locator('[role="alert"]').innerText().catch(() => null);
        report.submitAlert = alert ? alert.slice(0, 160) : null;
        report.steps.push({ step: "resubmit", ok: true });
      } else {
        report.steps.push({
          step: "submit-still-disabled",
          bodyHint: (await page.evaluate(() => document.body.innerText || "")).slice(0, 400),
        });
      }
    }
  } else {
    // Draft may exist under different listing — try upload fresh only if no title
    report.steps.push({ step: "title-not-on-account-beats" });
  }

  // Moderator path
  await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  await login(page, mod);
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await mute(page);
  const listText = await page.evaluate((t) => {
    const body = document.body.innerText || "";
    return {
      hasTitle: body.includes(t),
      pendingSection: /W moderacji/i.test(body),
      approvedSection: /Zatwierdzone/i.test(body),
    };
  }, TITLE);
  report.modList = listText;

  const row = page.locator("li").filter({ hasText: TITLE });
  if ((await row.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "still-missing-in-moderation";
  } else {
    await row
      .first()
      .getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i })
      .click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });

    // Close reviews
    for (let n = 0; n < 5; n++) {
      const close = page.getByRole("button", { name: /Zamknij sprawę/i });
      if ((await close.count()) === 0) break;
      await close.first().click();
      await page.waitForTimeout(1500);
    }

    const approve = page.getByRole("button", { name: /^Zatwierdź$/i });
    if ((await approve.count()) > 0 && !(await approve.first().isDisabled())) {
      await approve.first().click();
      await page.waitForTimeout(3000);
      report.steps.push({ step: "approve", ok: true });
      await page.goto(`${base}/admin/moderation`, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      const row2 = page.locator("li").filter({ hasText: TITLE });
      await row2.first().getByRole("link", { name: /Opublikuj/i }).click();
      await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
      for (let n = 0; n < 5; n++) {
        const close = page.getByRole("button", { name: /Zamknij sprawę/i });
        if ((await close.count()) === 0) break;
        await close.first().click();
        await page.waitForTimeout(1500);
      }
    }

    const publish = page.getByRole("button", { name: /^Opublikuj$/i });
    if ((await publish.count()) === 0) {
      report.status = "BLOCKED";
      report.defect = "no-publish-btn";
    } else if (await publish.first().isDisabled()) {
      report.status = "BLOCKED";
      report.defect = "publish-disabled";
    } else {
      await publish.first().click();
      await page.waitForTimeout(4000);
      const alert = await page.locator('[role="alert"]').innerText().catch(() => "");
      if (alert && /nie powiod|oświadcz|praw/i.test(alert)) {
        report.status = "BLOCKED";
        report.defect = "publish-alert";
        report.errorClass = /oświadcz/i.test(alert) ? "ATTESTATION" : "RIGHTS";
      } else {
        report.status = "PASS";
        report.steps.push({ step: "publish", ok: true });
      }
    }
  }
} catch (e) {
  report.status = "FAIL";
  report.defect = String(e?.message || e).slice(0, 200);
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "replacement-resume-publish-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    status: report.status,
    defect: report.defect,
    ownerBeatsHasTitle: report.ownerBeatsHasTitle,
    modList: report.modList,
    steps: report.steps,
  }),
);
process.exit(report.status === "PASS" ? 0 : 1);
