/**
 * CLI: BPM Ensemble Experiment V3.
 * Usage: npm run experiment:bpm-v3
 */

import fs from "node:fs";
import path from "node:path";

async function main() {
  const { runBpmExperimentV3 } = await import(
    "../src/lib/beats/bpm-experiment-v3/run"
  );
  const fixturesDir =
    process.env.BPM_FIXTURES_DIR ??
    path.resolve(process.cwd(), "..", "bitrymdym-fixtures");

  const result = await runBpmExperimentV3({ fixturesDir });
  const outPath =
    process.env.BPM_EXPERIMENT_V3_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-experiment-v3.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  // Compact console summary
  const compactMetrics = (m: typeof result.realMetrics) =>
    Object.fromEntries(
      Object.entries(m).map(([k, v]) => [
        k,
        {
          auto: v.autoAccept,
          manual: v.manualRequired,
          coverage: v.coverage,
          abstain: v.abstainRate,
          precision: v.precisionOfAutoAccept,
          exact: v.exact,
          within2: v.within2,
          halfDouble: v.halfDouble,
          harmonic: v.harmonic,
          miss: v.miss,
        },
      ]),
    );

  console.log(
    JSON.stringify(
      {
        status: result.status,
        outPath,
        baselineCheck: result.baselineCheck,
        agreementCounts: result.agreementCounts,
        candidateSupportCounts: result.candidateSupportCounts,
        relationCounts: result.relationCounts,
        realMetrics: compactMetrics(result.realMetrics),
        synthMetrics: compactMetrics(result.synthMetrics),
        focus: result.focus,
        overfittingCheck: result.overfittingCheck,
      },
      null,
      2,
    ),
  );

  if (result.status === "BLOCKED") process.exitCode = 2;
  if (result.status === "BASELINE_MISMATCH") process.exitCode = 3;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
