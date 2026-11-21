#!/usr/bin/env node
/**
 * Production smoke test (2026-11-22). Runs after every Vercel production deploy
 * (.github/workflows/smoke-production.yml) and by hand: `node scripts/smoke-production.mjs`.
 * Public checks only — no account, no payment, no writes.
 * Each check names what a user would lose if it failed.
 */
const BASE = (process.env.SMOKE_BASE_URL || "https://www.bitrymdym.pl").replace(/\/$/, "");
const APEX = process.env.SMOKE_APEX_URL || "https://bitrymdym.pl";
const UA = "BitRymDym-smoke/1";

async function get(url, init = {}) {
  const res = await fetch(url, { redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000), ...init });
  const body = init.method === "HEAD" ? "" : await res.text();
  return { status: res.status, headers: res.headers, body };
}

const checks = [
  ["Strona główna działa", async () => {
    const r = await get(`${BASE}/`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!/BitRymDym/i.test(r.body)) throw new Error("brak nazwy w HTML");
  }],
  ["Adres bez www przekierowuje na www", async () => {
    const r = await get(`${APEX}/`);
    const loc = r.headers.get("location") || "";
    if (![301, 307, 308].includes(r.status) || !loc.startsWith(BASE)) throw new Error(`status ${r.status} → ${loc}`);
  }],
  ["Logowanie się otwiera", async () => {
    const r = await get(`${BASE}/sign-in`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!/type="password"|name="password"/.test(r.body)) throw new Error("brak pola hasła");
  }],
  ["Reset hasła się otwiera", async () => {
    const r = await get(`${BASE}/forgot-password`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  }],
  ["Komunikat po zmianie hasła", async () => {
    const r = await get(`${BASE}/sign-in?haslo=zmienione`);
    if (r.status !== 200 || !r.body.includes("password-changed-notice")) throw new Error("brak komunikatu");
  }],
  ["Studio wymaga logowania (nie 500)", async () => {
    const r = await get(`${BASE}/studio`);
    const loc = r.headers.get("location") || "";
    if (![302, 303, 307, 308].includes(r.status) || !loc.includes("/sign-in")) throw new Error(`status ${r.status} → ${loc}`);
  }],
  ["Premium i cennik", async () => {
    const r = await get(`${BASE}/premium`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  }],
  ["Katalog bitów", async () => {
    const r = await get(`${BASE}/beats`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  }],
  ["CSP pozwala na blob: (Analizuj mix, Mastering, eksport)", async () => {
    const r = await get(`${BASE}/`, { method: "HEAD" });
    const csp = r.headers.get("content-security-policy") || r.headers.get("content-security-policy-report-only") || "";
    const connect = (csp.split(";").find((p) => p.trim().startsWith("connect-src")) || "");
    if (!connect) throw new Error("brak connect-src");
    if (!/\bblob:/.test(connect)) throw new Error("connect-src bez blob:");
    const media = (csp.split(";").find((p) => p.trim().startsWith("media-src")) || "");
    if (media && !/\bblob:/.test(media)) throw new Error("media-src bez blob:");
    const script = (csp.split(";").find((p) => p.trim().startsWith("script-src")) || "");
    if (!script.includes("challenges.cloudflare.com")) throw new Error("script-src bez Turnstile");
  }],
  ["Serwer audio (edge.bitrymdym.pl) odpowiada", async () => {
    const r = await get("https://edge.bitrymdym.pl/healthz");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  }],
  ["Kolejka eksportu i masterów nie stoi (Contabo)", async () => {
    const r = await get(`${BASE}/api/health/queues`);
    if (r.status !== 200) throw new Error(`status ${r.status}: ${r.body.slice(0, 200)}`);
  }],
  ["Mapa strony na www", async () => {
    const r = await get(`${BASE}/sitemap.xml`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (/<loc>https:\/\/bitrymdym\.pl/.test(r.body)) throw new Error("adresy bez www");
  }],
  ["Powiadomienia PayU odrzucają brak podpisu (nie 500)", async () => {
    const r = await get(`${BASE}/api/webhooks/payu`, { method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: "{}" });
    if (r.status >= 500 || r.status < 400) throw new Error(`status ${r.status}`);
  }],
];

let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} OK (${BASE})`);
process.exit(failed ? 1 : 0);
