/**
 * Production isolation guard for LOCAL BPM E2E.
 *
 * Usage:
 *   npx tsx scripts/_assert-local-supabase-env.ts
 *   npx tsx scripts/_assert-local-supabase-env.ts --env-file .env.local.e2e
 *
 * EXIT 0 = LOCAL safe
 * EXIT 2 = PRODUCTION URL DETECTED → ABORT
 * EXIT 1 = missing/invalid env
 *
 * Does not mutate any database.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]!] = val;
  }
  return out;
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") return true;
    if (host === "0.0.0.0") return true;
    if (host.endsWith(".supabase.local")) return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeProductionSupabase(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.in");
  } catch {
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const envFileIdx = args.indexOf("--env-file");
  const envFile =
    envFileIdx >= 0 && args[envFileIdx + 1]
      ? resolve(process.cwd(), args[envFileIdx + 1]!)
      : resolve(process.cwd(), ".env.local.e2e");

  const fileEnv = parseEnvFile(envFile);
  const env = { ...fileEnv, ...process.env };

  const url =
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    env.SUPABASE_URL?.trim() ||
    "";

  console.log(`ENV_FILE: ${existsSync(envFile) ? envFile : "(missing)"}`);
  console.log(`URL_PRESENT: ${Boolean(url)}`);

  if (!url) {
    console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL missing.");
    process.exit(1);
  }

  if (looksLikeProductionSupabase(url)) {
    console.error("PRODUCTION URL DETECTED → ABORT");
    console.error(`HOST: ${new URL(url).hostname}`);
    console.error(
      "Do not run mutating BPM E2E against *.supabase.co / *.supabase.in.",
    );
    process.exit(2);
  }

  if (!isLocalSupabaseUrl(url)) {
    console.error("ABORT: URL is neither localhost nor known local Supabase host.");
    console.error(`URL_HOST: ${new URL(url).hostname}`);
    process.exit(1);
  }

  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const anon =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    env.SUPABASE_ANON_KEY?.trim() ||
    "";

  if (!service) {
    console.error("ABORT: SUPABASE_SERVICE_ROLE_KEY missing for local E2E.");
    process.exit(1);
  }
  if (!anon) {
    console.error("ABORT: NEXT_PUBLIC_SUPABASE_ANON_KEY missing for local E2E.");
    process.exit(1);
  }

  // Heuristic: never allow known production project ref in URL path/host.
  if (url.includes("rzzxrgcdogkybkiidqgw")) {
    console.error("PRODUCTION PROJECT REF DETECTED → ABORT");
    process.exit(2);
  }

  console.log("SUPABASE ENVIRONMENT = LOCAL");
  console.log(`URL: ${url}`);
  console.log("GUARD: PASS");
  process.exit(0);
}

main();
