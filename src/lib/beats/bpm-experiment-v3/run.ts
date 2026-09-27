/**
 * Experiment V3 runner — ensemble strategies on V2 A/B outputs.
 * Reuses V2 estimators; single PCM decode per fixture.
 */

import fs from "node:fs";

import decode from "audio-decode";

import {
  runEstimatorA,
  runEstimatorB,
} from "@/lib/beats/bpm-experiment-v2/estimators";
import {
  DEFAULT_BPM_FIXTURES_DIR,
  discoverBpmFixtures,
} from "@/lib/beats/bpm-benchmark/discover";
import {
  outcomeForFixture,
  scoreStrategyOutcomes,
  type StrategyFixtureOutcome,
  type StrategyMetrics,
} from "@/lib/beats/bpm-experiment-v3/metrics";
import {
  ALL_STRATEGIES,
  analyzePair,
  runStrategy,
  type EnsembleStrategyId,
  type PairAnalysis,
} from "@/lib/beats/bpm-experiment-v3/strategies";

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0]!;
  const length = channelData[0]!.length;
  const mono = new Float32Array(length);
  const n = channelData.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) sum += channelData[c]![i] ?? 0;
    mono[i] = sum / n;
  }
  return mono;
}

/** V2 published REAL baselines (exact / ±2 rates) — must match A_ONLY / B_ONLY. */
const V2_REAL_BASELINE = {
  A: { exact: 4, within2: 8, n: 17 },
  B: { exact: 8, within2: 10, n: 17 },
};

const FOCUS_FILES = [
  "rap-boombap-90-fs680221.mp3",
  "rap-boombap-90-fs682512.mp3",
  "rap-boombap-90-fs336135.mp3",
  "rap-trap-140-fs456135.mp3",
  "rap-trap-140-fs852267.mp3",
  "rap-boombap-142-fs838789.mp3",
  "rap-boombap-87-fs590045.mp3",
  "rap-boombap-88-fs629137.mp3",
  "rap-boombap-100-fs336134.mp3",
  "rap-boombap-100-fs413687.mp3",
];

export type FixturePairRow = {
  file: string;
  layer: string;
  expectedBpm: number;
  aBpm: number | null;
  bBpm: number | null;
  aConfidence: number | null;
  bConfidence: number | null;
  analysis: PairAnalysis;
  strategyOutcomes: Record<EnsembleStrategyId, StrategyFixtureOutcome>;
};

export async function runBpmExperimentV3(params?: { fixturesDir?: string }) {
  const fixturesDir = params?.fixturesDir ?? DEFAULT_BPM_FIXTURES_DIR;
  const fixtures = discoverBpmFixtures(fixturesDir);

  const pairs: FixturePairRow[] = [];

  for (const meta of fixtures) {
    const bytes = fs.readFileSync(meta.absolutePath);
    const audio = await decode(bytes);
    const channelData = audio.channelData as Float32Array[];
    const samples = mixToMono(channelData);
    const a = runEstimatorA(samples, audio.sampleRate);
    const b = runEstimatorB(samples, audio.sampleRate);
    const analysis = analyzePair({ a, b, expectedBpm: meta.expectedBpm });

    const strategyOutcomes = {} as Record<
      EnsembleStrategyId,
      StrategyFixtureOutcome
    >;
    for (const id of ALL_STRATEGIES) {
      const result = runStrategy(id, a, b, analysis);
      strategyOutcomes[id] = outcomeForFixture({
        file: meta.file,
        layer: meta.layer,
        expectedBpm: meta.expectedBpm,
        result,
      });
    }

    pairs.push({
      file: meta.file,
      layer: meta.layer,
      expectedBpm: meta.expectedBpm,
      aBpm: a.rawTopBpm,
      bBpm: b.rawTopBpm,
      aConfidence: a.confidence,
      bConfidence: b.confidence,
      analysis,
      strategyOutcomes,
    });
  }

  const real = pairs.filter((p) => p.layer !== "SYNTHETIC");
  const synth = pairs.filter((p) => p.layer === "SYNTHETIC");

  function metricsFor(
    subset: FixturePairRow[],
  ): Record<EnsembleStrategyId, StrategyMetrics> {
    const out = {} as Record<EnsembleStrategyId, StrategyMetrics>;
    for (const id of ALL_STRATEGIES) {
      const outcomes = subset.map((p) => p.strategyOutcomes[id]!);
      out[id] = scoreStrategyOutcomes(id, outcomes);
    }
    return out;
  }

  const realMetrics = metricsFor(real);
  const synthMetrics = metricsFor(synth);

  // Baseline gate vs V2
  const aExact = realMetrics.A_ONLY.exact;
  const aW2 = realMetrics.A_ONLY.within2;
  const bExact = realMetrics.B_ONLY.exact;
  const bW2 = realMetrics.B_ONLY.within2;
  const baselineOk =
    aExact === V2_REAL_BASELINE.A.exact &&
    aW2 === V2_REAL_BASELINE.A.within2 &&
    bExact === V2_REAL_BASELINE.B.exact &&
    bW2 === V2_REAL_BASELINE.B.within2 &&
    real.length === V2_REAL_BASELINE.A.n;

  const agreementCounts = {
    AGREEMENT: real.filter((p) => p.analysis.agreement === "AGREEMENT").length,
    NEAR_AGREEMENT: real.filter((p) => p.analysis.agreement === "NEAR_AGREEMENT")
      .length,
    CONFLICT: real.filter((p) => p.analysis.agreement === "CONFLICT").length,
  };

  const candidateSupportCounts: Record<string, number> = {};
  for (const p of real) {
    const k = p.analysis.candidateSupport;
    candidateSupportCounts[k] = (candidateSupportCounts[k] || 0) + 1;
  }

  const relationCounts: Record<string, number> = {};
  for (const p of real) {
    const k = p.analysis.relation.kind;
    relationCounts[k] = (relationCounts[k] || 0) + 1;
  }

  const focus = pairs
    .filter((p) => FOCUS_FILES.includes(p.file))
    .map((p) => ({
      file: p.file,
      expected: p.expectedBpm,
      a: p.aBpm,
      b: p.bBpm,
      aConf: p.aConfidence,
      bConf: p.bConfidence,
      agreement: p.analysis.agreement,
      relation: p.analysis.relation.kind,
      candidateSupport: p.analysis.candidateSupport,
      aTopInB: p.analysis.aTopInB,
      bTopInA: p.analysis.bTopInA,
      expectedInA: p.analysis.expectedInA,
      expectedInB: p.analysis.expectedInB,
      strategies: Object.fromEntries(
        ALL_STRATEGIES.map((id) => {
          const o = p.strategyOutcomes[id]!;
          return [
            id,
            {
              decision: o.result.decision,
              bpm: o.result.bpm,
              reason: o.result.reason,
              cls: o.classification,
              correct: o.autoAcceptCorrect,
            },
          ];
        }),
      ),
    }));

  // Overfitting check: G3/G4 harmonic band rule is GENERAL (70–160);
  // verify it isn't only winning on the 90→120 pair.
  const g3AutoReal = real.filter(
    (p) => p.strategyOutcomes.G3_AGREEMENT_OR_HARMONIC.result.decision === "AUTO_ACCEPT",
  );
  const g3FromHarmonic = g3AutoReal.filter(
    (p) =>
      p.strategyOutcomes.G3_AGREEMENT_OR_HARMONIC.result.reason.startsWith(
        "harmonic",
      ),
  );

  return {
    status: fixtures.length
      ? baselineOk
        ? ("RAN" as const)
        : ("BASELINE_MISMATCH" as const)
      : ("BLOCKED" as const),
    fixturesDir,
    fixtureCount: fixtures.length,
    realCount: real.length,
    synthCount: synth.length,
    baselineCheck: {
      ok: baselineOk,
      expected: V2_REAL_BASELINE,
      observed: {
        A: { exact: aExact, within2: aW2, n: real.length },
        B: { exact: bExact, within2: bW2, n: real.length },
      },
    },
    agreementCounts,
    candidateSupportCounts,
    relationCounts,
    realMetrics,
    synthMetrics,
    focus,
    overfittingCheck: {
      note: "G3/G4 harmonic pick uses GENERAL RULE (prefer 70–160 / nearer 100), not fixture IDs.",
      g3AutoAcceptReal: g3AutoReal.length,
      g3AcceptedViaHarmonic: g3FromHarmonic.length,
      g3HarmonicFiles: g3FromHarmonic.map((p) => ({
        file: p.file,
        expected: p.expectedBpm,
        bpm: p.strategyOutcomes.G3_AGREEMENT_OR_HARMONIC.result.bpm,
        correct:
          p.strategyOutcomes.G3_AGREEMENT_OR_HARMONIC.autoAcceptCorrect,
        relation: p.analysis.relation.kind,
      })),
      ruleClassification: "GENERAL RULE",
    },
    pairsSummary: pairs.map((p) => ({
      file: p.file,
      layer: p.layer,
      expected: p.expectedBpm,
      a: p.aBpm,
      b: p.bBpm,
      agreement: p.analysis.agreement,
      relation: p.analysis.relation.kind,
      support: p.analysis.candidateSupport,
    })),
  };
}
