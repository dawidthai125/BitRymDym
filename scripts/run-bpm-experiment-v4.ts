/**
 * CLI: BPM Golden Validation V4.
 * Usage: npm run experiment:bpm-v4
 */

import fs from "node:fs";
import path from "node:path";

async function main() {
  const { runBpmExperimentV4 } = await import(
    "../src/lib/beats/bpm-experiment-v4/run"
  );
  const fixturesDir =
    process.env.BPM_FIXTURES_DIR ??
    path.resolve(process.cwd(), "..", "bitrymdym-fixtures");

  const result = await runBpmExperimentV4({ fixturesDir });
  const outPath =
    process.env.BPM_EXPERIMENT_V4_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-experiment-v4.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  const compact = (m: Record<string, { precision: number | null; coverage: number; abstain: number; falseAutoRate: number | null; autoAccept: number; autoWrong: number }>) =>
    Object.fromEntries(
      Object.entries(m).map(([k, v]) => [
        k,
        {
          precision: v.precision,
          coverage: v.coverage,
          abstain: v.abstain,
          falseAutoRate: v.falseAutoRate,
          auto: v.autoAccept,
          wrong: v.autoWrong,
        },
      ]),
    );

  console.log(
    JSON.stringify(
      {
        status: result.status,
        outPath,
        golden: result.golden,
        baselineCheck: result.baselineCheck,
        agreementButWrong: result.agreementAnalysis.agreementButWrong,
        agreementSummary: {
          exactAgreement: result.agreementAnalysis.exactAgreementCount,
          agreementButWrong: result.agreementAnalysis.agreementButWrongCount,
          allAgreements: result.agreementAnalysis.allAgreements,
        },
        cNearSafety: {
          original17: {
            precision: result.cNearSafety.original17.precision,
            coverage: result.cNearSafety.original17.coverage,
            abstain: result.cNearSafety.original17.abstain,
            falseAutoRate: result.cNearSafety.original17.falseAutoRate,
            auto: result.cNearSafety.original17.autoAccept,
            wrong: result.cNearSafety.original17.autoWrong,
          },
          realAll: {
            precision: result.cNearSafety.realAll.precision,
            coverage: result.cNearSafety.realAll.coverage,
            abstain: result.cNearSafety.realAll.abstain,
            falseAutoRate: result.cNearSafety.realAll.falseAutoRate,
            auto: result.cNearSafety.realAll.autoAccept,
            wrong: result.cNearSafety.realAll.autoWrong,
          },
          synthetic: {
            precision: result.cNearSafety.synthetic.precision,
            coverage: result.cNearSafety.synthetic.coverage,
            abstain: result.cNearSafety.synthetic.abstain,
            falseAutoRate: result.cNearSafety.synthetic.falseAutoRate,
          },
          autoDetailReal: result.cNearSafety.autoDetailReal,
        },
        ruleTradeoff: {
          realAll: compact(result.ruleMetrics.realAll),
          synthetic: compact(result.ruleMetrics.synthetic),
        },
        certificationQuestion: result.certificationQuestion,
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
