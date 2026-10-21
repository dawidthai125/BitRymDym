/**
 * Start Next.js on 127.0.0.1:3017 using ONLY .env.local.e2e (local Supabase).
 * Does not modify .env / .env.local. Aborts if URL is not loopback.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function assertLocalUrl(url, label) {
  const host = new URL(url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error(`ABORT: ${label} is not loopback (${host})`);
    process.exit(2);
  }
}

const envFile = resolve(process.cwd(), ".env.local.e2e");
const fileEnv = parseEnvFile(envFile);
const url = fileEnv.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL missing in .env.local.e2e");
  process.exit(1);
}
assertLocalUrl(url, "NEXT_PUBLIC_SUPABASE_URL");
if (url.includes("rzzxrgcdogkybkiidqgw") || url.includes(".supabase.co")) {
  console.error("ABORT: production Supabase URL");
  process.exit(2);
}

const childEnv = {
  ...process.env,
  ...fileEnv,
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3017",
  E3_RENDER_JOBS_ENABLED: fileEnv.E3_RENDER_JOBS_ENABLED ?? "true",
  PORT: "3017",
  HOSTNAME: "127.0.0.1",
};

console.log("Starting Next on http://127.0.0.1:3017 (local Supabase only)");
console.log(`SUPABASE_HOST=${new URL(url).hostname}:${new URL(url).port || "default"}`);

const child = spawn(
  "npx",
  ["next", "dev", "-H", "127.0.0.1", "-p", "3017"],
  {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
