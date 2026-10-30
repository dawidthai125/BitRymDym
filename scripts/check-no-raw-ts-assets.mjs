// Post-build guard: a raw .ts/.tsx under .next/static means a bundler copied source as an
// asset (e.g. an unbundled Web Worker) — the browser cannot run it. Fail the build.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(".next", "static");
if (!existsSync(dir)) {
  console.error("[check-no-raw-ts] .next/static not found — run after `next build`.");
  process.exit(1);
}
const bad = readdirSync(dir, { recursive: true })
  .map(String)
  .filter((f) => /\.(c|m)?tsx?$/.test(f) && !f.endsWith(".d.ts"));
if (bad.length > 0) {
  console.error(`[check-no-raw-ts] raw TypeScript emitted as static assets:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log("[check-no-raw-ts] OK — no raw .ts assets in .next/static");
