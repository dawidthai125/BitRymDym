#!/usr/bin/env node
/**
 * Fast uptime check on the Contabo host, every 5 minutes (2026-11-23). The hourly site-watch runs
 * 13 checks; this one only asks for robots.txt (answered by the CDN, no server CPU) and for the
 * apex redirect header. A paused Vercel project answers 402 on both. Two failures in a row → mail.
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL, ALERT_EMAIL, STATE_DIRECTORY, UPTIME_URL.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const URL_TO_CHECK = process.env.UPTIME_URL || "https://www.bitrymdym.pl/robots.txt";

/** Pure: what to do after one check. `down` is the state the owner was last told about. */
export function nextUptimeState(previous, ok) {
  const failures = ok ? 0 : (previous.failures ?? 0) + 1;
  if (!ok && !previous.down && failures >= 2) return { state: { failures, down: true }, mail: "down" };
  if (ok && previous.down) return { state: { failures: 0, down: false }, mail: "up" };
  return { state: { failures, down: !!previous.down }, mail: null };
}

async function check() {
  try {
    const res = await fetch(URL_TO_CHECK, { headers: { "user-agent": "BitRymDym-uptime/1" }, signal: AbortSignal.timeout(15_000) });
    await res.text();
    const reason = res.headers.get("x-vercel-error");
    return { ok: res.status === 200, detail: `HTTP ${res.status}${reason ? ` (${reason})` : ""}`, paused: res.status === 402 };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error), paused: false };
  }
}

async function mail(subject, text) {
  const { RESEND_API_KEY: key, RESEND_FROM_EMAIL: from, ALERT_EMAIL: to } = process.env;
  if (!key || !from || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, tags: [{ name: "kind", value: "uptime" }] }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return !!res?.ok;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.STATE_DIRECTORY || "/tmp/bitrymdym-uptime";
  const file = path.join(dir, "state.json");
  await mkdir(dir, { recursive: true });
  const previous = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  const result = await check();
  const next = nextUptimeState(previous, result.ok);
  let sent = true;
  if (next.mail === "down") {
    sent = await mail(
      "BitRymDym: strona nie działa",
      `${URL_TO_CHECK}: ${result.detail}, dwa razy z rzędu (${new Date().toISOString()}).\n\n${result.paused ? "To wygląda na wstrzymanie przez Vercela (limit wydatków): https://vercel.com/dawidthai125s-projects/~/settings/billing/spend-management" : "Sprawdź: https://vercel.com/dawidthai125s-projects/bitrymdym"}`,
    );
  } else if (next.mail === "up") {
    sent = await mail("BitRymDym: strona znów działa", `Sprawdzenie o ${new Date().toISOString()}: ${result.detail}.`);
  }
  // Remember the change only once the mail went out, so a mail outage retries in 5 minutes.
  await writeFile(file, JSON.stringify(sent ? next.state : { ...previous, failures: next.state.failures }));
  console.info("[uptime]", result.ok ? "ok" : "FAIL", result.detail, next.mail ?? "");
}
