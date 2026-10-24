/**
 * 1) Count local roles including ADMIN
 * 2) Capture publish button error class via UI (no secrets)
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "fs";
import path from "path";

function parseStatusEnv() {
  const raw = execSync("npx.cmd --yes supabase status -o env", {
    encoding: "utf8",
    env: {
      ...process.env,
      Path:
        "C:\\Program Files\\Docker\\Docker\\resources\\bin;" +
        (process.env.Path || process.env.PATH || ""),
    },
  });
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const st = parseStatusEnv();
const api = (st.API_URL || "").replace(/\/$/, "");
const admin = createClient(api, st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const roleCounts = {};
let localAdmin = 0;
let anyAdmin = 0;
for (const u of listed.data?.users || []) {
  const prof = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
  const role = prof.data?.role ?? "UNKNOWN";
  roleCounts[role] = (roleCounts[role] || 0) + 1;
  if (role === "ADMIN") {
    anyAdmin += 1;
    if (u.email?.endsWith("@localhost.local")) localAdmin += 1;
  }
}

const pathsFile = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24/_creds-paths.json",
);
const paths = JSON.parse(fs.readFileSync(pathsFile, "utf8"));
const creds = JSON.parse(fs.readFileSync(paths.mod, "utf8"));
const base = creds.base;
const FIXTURE = "Visual Fixture — Local Only";

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90000 });
await page.getByLabel(/e-mail/i).fill(creds.email);
await page.getByLabel(/hasło|password/i).fill(creds.password);
await page.getByRole("button", { name: /zaloguj/i }).click();
await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60000 });
await page.goto(`${base}/admin/moderation`, { waitUntil: "networkidle", timeout: 90000 });
const row = page.locator("li").filter({ hasText: FIXTURE });
let ui = { rowCount: await row.count() };
if (ui.rowCount > 0) {
  await row.first().getByRole("link", { name: /Opublikuj/i }).click();
  await page.waitForURL(/\/admin\/moderation\//, { timeout: 30000 });
  const pub = page.getByRole("button", { name: /^Opublikuj$/i });
  ui.hadPublishButton = (await pub.count()) > 0;
  if (ui.hadPublishButton) {
    await pub.first().click();
    await page.waitForTimeout(3500);
    const alert = page.locator('[role="alert"]');
    const alertText =
      (await alert.count()) > 0 ? await alert.first().innerText() : "";
    const body = await page.evaluate(() => document.body.innerText || "");
    ui.alertPresent = Boolean(alertText);
    ui.alertMentionsRights = /oświadcz|praw|kontroli praw|Master/i.test(
      alertText || body,
    );
    ui.errorClass = /oświadcz/i.test(alertText)
      ? "ATTESTATION_REQUIRED"
      : /praw/i.test(alertText)
        ? "RIGHTS_GATE"
        : alertText
          ? "OTHER_ALERT"
          : "NO_ALERT";
    ui.stillOnDetail = /\/admin\/moderation\//.test(page.url());
  }
}
await browser.close();

console.log(
  JSON.stringify(
    {
      roleCounts,
      localAdminCount: localAdmin,
      anyAdminCount: anyAdmin,
      fixtureStatusStill: (
        await admin
          .from("beats")
          .select("status")
          .eq("title", FIXTURE)
          .maybeSingle()
      ).data?.status,
      publishUi: ui,
    },
    null,
    2,
  ),
);
