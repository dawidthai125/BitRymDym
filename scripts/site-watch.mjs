#!/usr/bin/env node
/**
 * Site watch on the Contabo host (2026-11-22). GitHub scheduled workflows did not fire
 * for this repo, so the hourly queue check and the daily smoke never ran between deploys.
 * A systemd timer runs this every hour: it runs scripts/smoke-production.mjs (13 public
 * checks incl. /api/health/queues) and emails ALERT_EMAIL through Resend only when the
 * state changes (broken → mail; fixed again → mail). No account, no writes on the site.
 *
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL, ALERT_EMAIL, STATE_DIRECTORY (systemd) or WATCH_STATE_DIR.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stateDir = process.env.STATE_DIRECTORY || process.env.WATCH_STATE_DIR || "/tmp/bitrymdym-site-watch";
const stateFile = path.join(stateDir, "state.json");

function runSmoke() {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(here, "smoke-production.mjs")], { timeout: 5 * 60_000, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}${stderr}`.trim().slice(-6000) });
    });
  });
}

async function readState() {
  try {
    return JSON.parse(await readFile(stateFile, "utf8"));
  } catch {
    return { ok: true, since: null };
  }
}

async function mail(subject, text) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = process.env.ALERT_EMAIL?.trim();
  if (!key || !from || !to) {
    console.error("[site-watch] mail not configured");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, tags: [{ name: "kind", value: "site_watch" }] }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return !!res?.ok;
}

const now = new Date().toISOString();
const result = await runSmoke();
const prev = await readState();
await mkdir(stateDir, { recursive: true });

if (!result.ok && prev.ok) {
  const sent = await mail(
    "BitRymDym: coś przestało działać",
    `Czuwanie na serwerze Contabo wykryło problem (${now}).\n\nWynik sprawdzenia:\n\n${result.output}\n\nKolejny mail przyjdzie, gdy wszystko znów zadziała.`,
  );
  console.error("[site-watch] failing", { mailed: sent });
  // Only remember the failure once the mail went out, so a mail outage retries next hour.
  if (sent) await writeFile(stateFile, JSON.stringify({ ok: false, since: now }));
} else if (result.ok && !prev.ok) {
  const sent = await mail("BitRymDym: znów działa", `Wszystkie sprawdzenia przechodzą (${now}). Problem trwał od ${prev.since}.`);
  console.info("[site-watch] recovered", { mailed: sent });
  if (sent) await writeFile(stateFile, JSON.stringify({ ok: true, since: now }));
} else {
  console.info("[site-watch]", result.ok ? "ok" : "still failing");
}
process.exit(0);
