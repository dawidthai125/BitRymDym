/**
 * Publish APPROVED fixture via real /admin/moderation UI as existing theme-mod.
 * No SQL status patches. Creds via CREDS_PATH. No secrets in report.
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
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(new URL(base).origin)
) {
  throw new Error("REFUSE non-loopback base");
}

const report = {
  capturedAt: new Date().toISOString(),
  steps: [],
  status: "NOT_RUN",
  defect: null,
};

async function muteAudio(page) {
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
}

async function login(page) {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90000 });
  await muteAudio(page);
  await page.getByLabel(/e-mail/i).fill(creds.email);
  await page.getByLabel(/hasło|password/i).fill(creds.password);
  await page.getByRole("button", { name: /zaloguj/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), {
    timeout: 60000,
  });
  report.steps.push({ step: "login", ok: true, kind: creds.kind });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

try {
  await login(page);
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await muteAudio(page);
  const body = await page.evaluate(() => document.body.innerText || "");
  if (/brak dostępu|forbidden|403|zaloguj/i.test(body) && !/moderac/i.test(body)) {
    report.status = "BLOCKED";
    report.defect = "staff-moderation-access-denied";
  } else {
    // Queue rows: title in <p>, action Link text is "Opublikuj" / "Odtwórz / decyzja"
    const row = page.locator("li").filter({ hasText: FIXTURE });
    if ((await row.count()) === 0) {
      report.status = "BLOCKED";
      report.defect = "fixture-not-in-moderation-list";
      report.listHasApprovedSection = /Zatwierdzone/i.test(body);
      report.listSnippetKind = /Visual Fixture|Brak zatwierdzonych|W moderacji/i.test(
        body,
      )
        ? "matched-keywords"
        : "no-fixture-keywords";
    } else {
      const action = row.first().getByRole("link", {
        name: /Opublikuj|Odtwórz|decyzja/i,
      });
      if ((await action.count()) === 0) {
        report.status = "BLOCKED";
        report.defect = "moderation-row-action-missing";
      } else {
        await action.first().click();
      }
    }

    if (report.status !== "BLOCKED") {
      await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
      await muteAudio(page);
      report.steps.push({
        step: "open-detail",
        ok: true,
        pathKind: "moderation-detail",
      });

      const publish = page.getByRole("button", { name: /^Opublikuj$/i });
      if ((await publish.count()) === 0) {
        const detailText = await page.evaluate(
          () => document.body.innerText || "",
        );
        report.status = "BLOCKED";
        report.defect = "publish-button-missing";
        report.detailHint = /Opublikowany|PUBLISHED|Zatwierdzon|APPROVED|Odrzucon/i
          .exec(detailText)?.[0]
          ?? "unknown";
      } else {
        const disabled = await publish.first().isDisabled();
        if (disabled) {
          report.status = "BLOCKED";
          report.defect = "publish-button-disabled";
          report.detailHint = await page
            .locator("text=/Master|audio/i")
            .first()
            .innerText()
            .catch(() => null);
        } else {
          await publish.first().click();
          await page.waitForTimeout(2500);
          // Expect redirect to list or success state
          const after = await page.evaluate(() => document.body.innerText || "");
          const alert = page.locator('[role="alert"]');
          const alertText =
            (await alert.count()) > 0
              ? await alert.first().innerText()
              : null;
          if (alertText && /nie powiod|error|forbidden|RIGHTS_/i.test(alertText)) {
            report.status = "BLOCKED";
            report.defect = "publish-action-error";
            report.errorClass = /RIGHTS_\w+/.exec(alertText)?.[0] ?? "ui-error";
          } else if (/Opublikuj/i.test(after) && /Visual Fixture/i.test(after)) {
            // Still on detail with publish — may have failed silently
            report.status = "NOT_VERIFIED";
            report.defect = "still-on-publish-surface";
          } else {
            report.status = "PASS";
            report.steps.push({ step: "click-opublikuj", ok: true });
          }
        }
      }
    }
  }
} catch (e) {
  report.status = "FAIL";
  report.defect = String(e?.message || e).slice(0, 200);
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "publish-via-ui-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ status: report.status, defect: report.defect, steps: report.steps.length }));
process.exit(report.status === "PASS" ? 0 : 1);
