/**
 * CLI: BPM Golden Corpus Expansion V5 (evidence only).
 * Usage: npm run experiment:bpm-v5
 */

import fs from "node:fs";
import path from "node:path";

async function main() {
  const { runBpmExperimentV5 } = await import(
    "../src/lib/beats/bpm-experiment-v5/run"
  );
  const fixturesDir =
    process.env.BPM_FIXTURES_DIR ??
    path.resolve(process.cwd(), "..", "bitrymdym-fixtures");

  const result = await runBpmExperimentV5({ fixturesDir });
  const outPath =
    process.env.BPM_EXPERIMENT_V5_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-experiment-v5.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        status: result.status,
        outPath,
        previousCorpus: result.previousCorpus,
        newCorpus: result.newCorpus,
        addedCount: result.addedCount,
        targetMet: result.targetMet,
        baselineCheck: result.baselineCheck,
        bpmDistribution: result.bpmDistribution,
        materialCounts: result.materialCounts,
        estimatorA: result.estimatorA,
        estimatorB: result.estimatorB,
        cNear: result.cNear,
        ruleB: result.ruleB,
        falseAutoInventory: result.falseAutoInventory,
        bandAnalysis: result.bandAnalysis,
        priorityCoverage: result.priorityCoverage,
        materialAnalysis: result.materialAnalysis,
        remainingGaps: result.remainingGaps,
        certificationStatus: result.certificationStatus,
        addedFixtures: result.addedFixtures.map((f) => ({
          file: f.file,
          bpm: f.expectedBpm,
          material: f.material,
          duration: f.durationSec,
          license: f.provenance.license,
          author: f.provenance.author,
          url: f.provenance.sourceUrl,
        })),
      },
      null,
      2,
    ),
  );

  if (result.status === "BLOCKED") process.exitCode = 2;
  if (result.status === "BASELINE_MISMATCH") process.exitCode = 3;
  if (result.status === "RULE_B_SAFETY_BROKEN") process.exitCode = 4;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
