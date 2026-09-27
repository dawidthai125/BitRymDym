/**
 * CLI: discover + run BPM accuracy harness (no commit).
 * Usage: npx tsx scripts/run-bpm-benchmark.ts
 * Fixtures: ../bitrymdym-fixtures with naming conventions (outside git).
 */

import path from "node:path";

async function main() {
  const { runBpmBenchmark } = await import(
    "../src/lib/beats/bpm-benchmark/run"
  );
  const fixturesDir =
    process.env.BPM_FIXTURES_DIR ??
    path.resolve(process.cwd(), "..", "bitrymdym-fixtures");

  const result = await runBpmBenchmark({ fixturesDir });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "BLOCKED") {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
