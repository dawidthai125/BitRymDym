/**
 * UI-only: create Visual Fixture — Published Local Only
 * DRAFT → rights → PENDING_REVIEW → (close review) → APPROVED → PUBLISHED
 * No SQL status patches. Creds via CREDS_OWNER / CREDS_MOD.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const TITLE = "Visual Fixture — Published Local Only";
const BLOCKED = "Visual Fixture — Local Only";
const WAV = path.join(outDir, "_local-soft-click-4s.wav");
const owner = JSON.parse(fs.readFileSync(process.env.CREDS_OWNER, "utf8"));
const mod = JSON.parse(fs.readFileSync(process.env.CREDS_MOD, "utf8"));
const base = owner.base;
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(new URL(base).origin)
) {
  throw new Error("REFUSE non-loopback");
}

const report = {
  capturedAt: new Date().toISOString(),
  title: TITLE,
  blockedLeftUntouched: true,
  steps: [],
  status: "NOT_RUN",
  defect: null,
};

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
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), {
    timeout: 60000,
  });
  report.steps.push({ step: "login", kind: creds.kind, ok: true });
}

async function logout(page) {
  // Best-effort: go sign-out if present, else clear via navigate + new context later
  const menu = page.getByRole("button", { name: /konto|account|menu|profil/i });
  if ((await menu.count()) > 0) {
    await menu.first().click().catch(() => {});
    const out = page.getByRole("menuitem", { name: /wyloguj|sign out/i });
    if ((await out.count()) > 0) {
      await out.first().click();
      await page.waitForTimeout(1000);
    }
  }
  await page.goto(`${base}/sign-out`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.goto(`${base}/auth/sign-out`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
}

const browser = await chromium.launch({ headless: true });
let context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
let page = await context.newPage();

try {
  // --- OWNER: upload + attest + submit ---
  await login(page, owner);
  await page.goto(`${base}/beats/upload`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await mute(page);

  await page.locator('input[name="audio"]').setInputFiles(WAV);
  // Wait for analyze ready (duration shown)
  await page.waitForFunction(
    () => /Czas|00:0[1-9]|Analizowanie/i.test(document.body.innerText || ""),
    null,
    { timeout: 120000 },
  );
  // Wait until analyzing finishes and BPM options or error
  await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        if (/UNAVAILABLE|nie udało|błąd|error/i.test(t) && /BPM/i.test(t))
          return "bpm-fail";
        const radios = document.querySelectorAll(
          'input[type="radio"][name^="user-upload-bpm"]',
        );
        return radios.length > 0 ? "ok" : false;
      },
      null,
      { timeout: 180000 },
    )
    .catch(() => null);

  const bpmState = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const radios = [
      ...document.querySelectorAll(
        'input[type="radio"][name^="user-upload-bpm"]',
      ),
    ];
    return {
      radioCount: radios.length,
      unavailable: /niedostęp|UNAVAILABLE|nie wykry/i.test(t),
      snippet: t.slice(0, 500),
    };
  });
  report.steps.push({ step: "analyze", ...bpmState });

  if (bpmState.radioCount === 0) {
    report.status = "BLOCKED";
    report.defect = "bpm-allowlist-empty-or-unavailable";
    throw new Error(report.defect);
  }

  await page.locator('input[type="radio"][name^="user-upload-bpm"]').first().check({ force: true });
  await page.locator('input[name="title"]').fill(TITLE);
  report.steps.push({ step: "title-set", ok: true });

  await page.getByRole("button", { name: /Zapisz wersję roboczą/i }).click();
  await page.waitForTimeout(4000);
  // Wait for saved draft banner or submit enabled
  await page
    .waitForFunction(
      () => /Wersja robocza zapisana|audio gotowe/i.test(document.body.innerText || ""),
      null,
      { timeout: 120000 },
    )
    .catch(() => {});
  const draftOk = await page.evaluate(() =>
    /Wersja robocza zapisana|audio gotowe/i.test(document.body.innerText || ""),
  );
  report.steps.push({ step: "save-draft", ok: draftOk });
  if (!draftOk) {
    const alert = await page.locator('[role="alert"]').innerText().catch(() => null);
    report.status = "BLOCKED";
    report.defect = "draft-save-failed";
    report.alertClass = alert ? "present" : null;
    throw new Error(report.defect);
  }

  // Rights checkbox - exact UI text
  const rights = page.locator("label").filter({
    hasText: /Oświadczam, że mam prawa do tego nagrania/i,
  });
  await rights.locator('input[type="checkbox"]').check({ force: true });
  report.steps.push({ step: "rights-attestation-checked", ok: true });

  await page.getByRole("button", { name: /Wyślij do moderacji/i }).click();
  await page.waitForTimeout(3000);
  // May navigate to /account/beats
  await page.waitForURL(/\/account\/beats|\/beats\/upload/, { timeout: 60000 }).catch(() => {});
  const afterSubmit = await page.evaluate(() => document.body.innerText || "");
  const submitted =
    /oczekuje|moderac|PENDING|wysłan|przegląd/i.test(afterSubmit) ||
    page.url().includes("/account/beats");
  report.steps.push({
    step: "submit-moderation",
    ok: submitted,
    urlKind: page.url().includes("/account/beats") ? "account-beats" : "other",
  });
  if (!submitted) {
    report.status = "BLOCKED";
    report.defect = "submit-not-confirmed";
    throw new Error(report.defect);
  }

  // Fresh context for moderator (real form login, no storage seed)
  await context.close();
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  page = await context.newPage();
  await login(page, mod);

  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await mute(page);
  const row = page.locator("li").filter({ hasText: TITLE });
  if ((await row.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "fixture-missing-in-moderation-queue";
    throw new Error(report.defect);
  }
  await row
    .first()
    .getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i })
    .click();
  await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
  await mute(page);
  report.steps.push({ step: "open-moderation-detail", ok: true });

  // Close open rights reviews if present
  const closeBtns = page.getByRole("button", {
    name: /Zamknij sprawę/i,
  });
  const closeCount = await closeBtns.count();
  for (let i = 0; i < closeCount; i++) {
    await closeBtns.nth(0).click();
    await page.waitForTimeout(1500);
  }
  if (closeCount > 0) {
    report.steps.push({ step: "closed-open-reviews", count: closeCount });
    // May need to re-open detail if redirected
    if (!page.url().includes("/admin/moderation/")) {
      await page.goto(`${base}/admin/moderation`, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      const row2 = page.locator("li").filter({ hasText: TITLE });
      await row2
        .first()
        .getByRole("link", { name: /Odtwórz|decyzja|Opublikuj/i })
        .click();
      await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
    }
  }

  // Approve if still pending
  const approve = page.getByRole("button", { name: /^Zatwierdź$/i });
  if ((await approve.count()) > 0 && !(await approve.first().isDisabled())) {
    await approve.first().click();
    await page.waitForTimeout(2500);
    report.steps.push({ step: "approve", ok: true });
    // Back to list — open again for publish
    await page.goto(`${base}/admin/moderation`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    const row3 = page.locator("li").filter({ hasText: TITLE });
    if ((await row3.count()) === 0) {
      report.status = "BLOCKED";
      report.defect = "missing-after-approve";
      throw new Error(report.defect);
    }
    await row3.first().getByRole("link", { name: /Opublikuj/i }).click();
    await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
  }

  // Close any remaining reviews on APPROVED detail
  const close2 = page.getByRole("button", { name: /Zamknij sprawę/i });
  const c2 = await close2.count();
  for (let i = 0; i < c2; i++) {
    await close2.nth(0).click();
    await page.waitForTimeout(1500);
  }

  const publish = page.getByRole("button", { name: /^Opublikuj$/i });
  if ((await publish.count()) === 0) {
    report.status = "BLOCKED";
    report.defect = "publish-button-missing";
    throw new Error(report.defect);
  }
  if (await publish.first().isDisabled()) {
    report.status = "BLOCKED";
    report.defect = "publish-button-disabled";
    throw new Error(report.defect);
  }
  await publish.first().click();
  await page.waitForTimeout(3500);
  const alert = page.locator('[role="alert"]');
  const alertText =
    (await alert.count()) > 0 ? await alert.first().innerText() : "";
  if (alertText && /nie powiod|oświadcz|praw|FORBIDDEN|error/i.test(alertText)) {
    report.status = "BLOCKED";
    report.defect = "publish-failed";
    report.errorClass = /oświadcz/i.test(alertText)
      ? "ATTESTATION"
      : /praw/i.test(alertText)
        ? "RIGHTS"
        : "OTHER";
    throw new Error(report.defect);
  }
  report.steps.push({ step: "publish", ok: true });
  report.status = "PASS";

  // Confirm blocked title still not mutated via UI listing only (no SQL)
  await page.goto(`${base}/admin/moderation`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  const blockedStill = await page.evaluate(
    (t) => (document.body.innerText || "").includes(t),
    BLOCKED,
  );
  report.blockedStillListedSomewhere = blockedStill;
} catch (e) {
  if (report.status === "NOT_RUN") report.status = "FAIL";
  report.defect = report.defect || String(e?.message || e).slice(0, 200);
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "replacement-publish-ui-report.json"),
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
