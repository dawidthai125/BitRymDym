/**
 * CLI: BPM Experiment V2 (A=tempo vs B=combTempo). Tooling only.
 * Usage: npm run experiment:bpm-v2
 */

import fs from "node:fs";
import path from "node:path";

async function main() {
  const { runBpmExperimentV2 } = await import(
    "../src/lib/beats/bpm-experiment-v2/run"
  );
  const fixturesDir =
    process.env.BPM_FIXTURES_DIR ??
    path.resolve(process.cwd(), "..", "bitrymdym-fixtures");

  const result = await runBpmExperimentV2({ fixturesDir });
  const outPath =
    process.env.BPM_EXPERIMENT_V2_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-experiment-v2.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  const summary = {
    status: result.status,
    fixtureCount: result.fixtureCount,
    outPath,
    estimatorA: result.estimatorA,
    estimatorB: result.estimatorB,
    comparisonTable: result.comparisonTable,
    correlation: {
      bothCorrect: result.correlation.bothCorrect,
      aWrongBCorrect: result.correlation.aWrongBCorrect,
      aCorrectBWrong: result.correlation.aCorrectBWrong,
      bothWrong: result.correlation.bothWrong,
      pairs: result.correlation.pairs,
    },
    specialFixes: result.specialFixes,
    segments: result.segments,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (result.status === "BLOCKED") process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
