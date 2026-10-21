/**
 * Print KEY=value lines for LOCAL_SUPABASE_* from `supabase status -o env`.
 * For sourcing into the shell only — do not log to chat.
 */
import { execFileSync } from "node:child_process";

const out = execFileSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
  shell: true,
});
const map = {};
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  map[m[1]] = val;
}
const url = map.API_URL;
const anon = map.ANON_KEY;
const service = map.SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("missing API_URL/ANON_KEY/SERVICE_ROLE_KEY from supabase status");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error("non-local API_URL host:", host);
  process.exit(2);
}
process.stdout.write(`LOCAL_SUPABASE_URL=${url}\n`);
process.stdout.write(`LOCAL_SUPABASE_ANON_KEY=${anon}\n`);
process.stdout.write(`LOCAL_SUPABASE_SERVICE_ROLE_KEY=${service}\n`);
process.stdout.write(`BRD_INTEGRATION_TESTS=1\n`);
process.stdout.write(`BRD_HTTP_E2E=1\n`);
process.stdout.write(`NEXT_HTTP_BASE_URL=http://127.0.0.1:3017\n`);
