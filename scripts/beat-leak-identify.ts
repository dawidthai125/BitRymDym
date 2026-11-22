/**
 * Whose listen copy is this file? (Owner 2026-11-22) — CLI twin of the admin page /admin/wycieki.
 *   npm run leak:identify -- --beat <beatId> --file <leaked audio or video>
 * Runs on the E3 host (service role env). z >= 10 is a match; wrong copies stay near 0.
 * Prints copy id, account number, name and z. Never prints e-mails, keys or URLs.
 */
import path from "node:path";

import { identifyLeak } from "../src/lib/beats/listen-copy/listen-copy-worker";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const beatId = arg("--beat");
  const file = arg("--file");
  if (!beatId || !file) {
    console.log("usage: --beat <beatId> --file <path>");
    process.exitCode = 2;
    return;
  }
  const matches = await identifyLeak(createSupabaseAdminClient(), beatId, path.resolve(file));
  if (!matches.length) console.log(JSON.stringify({ event: "no_copies", beatId }));
  for (const m of matches) console.log(JSON.stringify(m));
}

main().catch((e) => {
  console.log(JSON.stringify({ event: "fatal", message: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
  process.exitCode = 1;
});
