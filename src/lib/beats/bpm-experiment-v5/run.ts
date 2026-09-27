/**
 * Experiment V5 — golden corpus expansion evidence run.
 * REUSES V2 estimators + V4 C_NEAR / RULE_B unchanged.
 * No algorithm changes.
 */

import fs from "node:fs";

import decode from "audio-decode";

import {
  classifyExperimentMatch,
  isExperimentCorrect,
  isHalfDouble,
  isHarmonic,
  type ExperimentClassification,
} from "@/lib/beats/bpm-experiment-v2/classify";
import {
  runEstimatorA,
  runEstimatorB,
} from "@/lib/beats/bpm-experiment-v2/estimators";
import {
  DEFAULT_BPM_FIXTURES_DIR,
  discoverBpmFixtures,
} from "@/lib/beats/bpm-benchmark/discover";
import {
  analyzePair,
  octaveRelation,
  runSafetyRule,
} from "@/lib/beats/bpm-experiment-v4/rules";
import {
  classifyAgreementWrong,
  outcomeForRule,
  scoreRuleOutcomes,
} from "@/lib/beats/bpm-experiment-v4/metrics";
import { normalizeTempoRelation } from "@/lib/beats/bpm-experiment-v3/relations";
import {
  fsIdFromFile,
  metaForFile,
  type MaterialType,
} from "@/lib/beats/bpm-experiment-v5/golden-manifest";

export const V4_REAL_COUNT = 31;

const V2_ORIGINAL_REAL_FILES = [
  "rap-boombap-87-fs590045.mp3",
  "rap-boombap-88-fs629137.mp3",
  "rap-boombap-90-fs336135.mp3",
  "rap-boombap-90-fs413688.mp3",
  "rap-boombap-90-fs680221.mp3",
  "rap-boombap-90-fs682512.mp3",
  "rap-boombap-100-fs336134.mp3",
  "rap-boombap-100-fs413687.mp3",
  "rap-boombap-142-fs838789.mp3",
  "rap-drill-140-fs484625.mp3",
  "rap-drill-140-fs484640.mp3",
  "rap-trap-140-fs456135.mp3",
  "rap-trap-140-fs797967.mp3",
  "rap-trap-140-fs852261.mp3",
  "rap-trap-140-fs852267.mp3",
  "rap-trap-140-fs852274.mp3",
  "rap-trap-150-fs852265.mp3",
] as const;

const V4_BASELINE_ORIGINAL17 = {
  A: { exact: 4, within2: 8 },
  B: { exact: 8, within2: 10 },
  C_NEAR: { auto: 7, precision: 0.8571 },
};

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

function estimatorBlock(
  rows: Array<{ classification: ExperimentClassification }>,
) {
  const n = rows.length;
  const exact = rows.filter((r) => r.classification === "EXACT").length;
  const within1 = rows.filter((r) =>
    ["EXACT", "WITHIN_1"].includes(r.classification),
  ).length;
  const within2 = rows.filter((r) =>
    isExperimentCorrect(r.classification),
  ).length;
  const halfDouble = rows.filter((r) =>
    isHalfDouble(r.classification),
  ).length;
  const harmonic = rows.filter((r) => isHarmonic(r.classification)).length;
  const miss = rows.filter((r) => r.classification === "MISS").length;
  return {
    n,
    exact,
    within1,
    within2,
    halfDouble,
    harmonic,
    miss,
    exactRate: n ? +(exact / n).toFixed(4) : 0,
    within2Rate: n ? +(within2 / n).toFixed(4) : 0,
  };
}

function falseAutoClass(
  expected: number,
  predicted: number | null,
): "OCTAVE" | "HARMONIC" | "NEIGHBOR" | "UNRELATED" | "OTHER" {
  if (predicted == null) return "OTHER";
  const kind = classifyAgreementWrong(expected, predicted);
  if (kind === "HALF" || kind === "DOUBLE") return "OCTAVE";
  if (kind === "HARMONIC") return "HARMONIC";
  if (kind === "NEIGHBOR" || kind === "WITHIN_TOL") return "NEIGHBOR";
  if (kind === "UNRELATED") return "UNRELATED";
  return "OTHER";
}

export async function runBpmExperimentV5(params?: { fixturesDir?: string }) {
  const fixturesDir = params?.fixturesDir ?? DEFAULT_BPM_FIXTURES_DIR;
  const fixtures = discoverBpmFixtures(fixturesDir);

  type Row = {
    file: string;
    layer: string;
    expectedBpm: number;
    material: MaterialType;
    durationSec: number;
    sampleRate: number;
    channels: number;
    format: string;
    aBpm: number | null;
    bBpm: number | null;
    aConfidence: number | null;
    bConfidence: number | null;
    aCls: ExperimentClassification;
    bCls: ExperimentClassification;
    agreement: string;
    relation: string;
    candidateSupport: string;
    cNear: ReturnType<typeof outcomeForRule>;
    ruleB: ReturnType<typeof outcomeForRule>;
    batch: string;
    provenance: {
      source: string;
      license: string;
      author: string;
      soundId: number | null;
      sourceUrl: string | null;
      bpmSource: string;
      material: MaterialType;
    };
  };

  const rows: Row[] = [];

  for (const meta of fixtures) {
    const bytes = fs.readFileSync(meta.absolutePath);
    const audio = await decode(bytes);
    const channelData = audio.channelData as Float32Array[];
    const samples = mixToMono(channelData);
    const durationSec = samples.length / audio.sampleRate;
    const format = meta.file.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
    const g = metaForFile(meta.file);

    const a = runEstimatorA(samples, audio.sampleRate);
    const b = runEstimatorB(samples, audio.sampleRate);
    const pair = analyzePair({ a, b, expectedBpm: meta.expectedBpm });
    const cNear = outcomeForRule({
      file: meta.file,
      layer: meta.layer,
      expectedBpm: meta.expectedBpm,
      result: runSafetyRule("C_NEAR", { pair, a, b, durationSec }),
    });
    const ruleB = outcomeForRule({
      file: meta.file,
      layer: meta.layer,
      expectedBpm: meta.expectedBpm,
      result: runSafetyRule("RULE_B_OCTAVE_AMBIGUITY", {
        pair,
        a,
        b,
        durationSec,
      }),
    });

    rows.push({
      file: meta.file,
      layer: meta.layer,
      expectedBpm: meta.expectedBpm,
      material: g?.material ?? "UNKNOWN",
      durationSec: +durationSec.toFixed(3),
      sampleRate: audio.sampleRate,
      channels: channelData.length,
      format,
      aBpm: a.rawTopBpm,
      bBpm: b.rawTopBpm,
      aConfidence: a.confidence,
      bConfidence: b.confidence,
      aCls: classifyExperimentMatch({
        expectedBpm: meta.expectedBpm,
        detectedBpm: a.rawTopBpm,
      }),
      bCls: classifyExperimentMatch({
        expectedBpm: meta.expectedBpm,
        detectedBpm: b.rawTopBpm,
      }),
      agreement: pair.agreement,
      relation: normalizeTempoRelation(a.rawTopBpm, b.rawTopBpm).kind,
      candidateSupport: pair.candidateSupport,
      cNear,
      ruleB,
      batch: g?.batch ?? "UNKNOWN",
      provenance: g
        ? {
            source: "Freesound",
            license: g.license,
            author: g.author,
            soundId: g.id,
            sourceUrl: `https://freesound.org/people/${g.username}/sounds/${g.id}/`,
            bpmSource: `source title/page: "${g.title}"`,
            material: g.material,
          }
        : {
            source: "UNKNOWN",
            license: "UNKNOWN",
            author: "UNKNOWN",
            soundId: fsIdFromFile(meta.file),
            sourceUrl: null,
            bpmSource: "filename convention only",
            material: "UNKNOWN",
          },
    });
  }

  const real = rows.filter((r) => r.layer !== "SYNTHETIC");
  const synth = rows.filter((r) => r.layer === "SYNTHETIC");
  const original17 = real.filter((r) =>
    (V2_ORIGINAL_REAL_FILES as readonly string[]).includes(r.file),
  );

  const a17 = estimatorBlock(original17.map((r) => ({ classification: r.aCls })));
  const b17 = estimatorBlock(original17.map((r) => ({ classification: r.bCls })));
  const cNear17 = scoreRuleOutcomes(
    "C_NEAR",
    original17.map((r) => r.cNear),
  );
  const baselineOk =
    original17.length === 17 &&
    a17.exact === V4_BASELINE_ORIGINAL17.A.exact &&
    a17.within2 === V4_BASELINE_ORIGINAL17.A.within2 &&
    b17.exact === V4_BASELINE_ORIGINAL17.B.exact &&
    b17.within2 === V4_BASELINE_ORIGINAL17.B.within2 &&
    cNear17.autoAccept === V4_BASELINE_ORIGINAL17.C_NEAR.auto &&
    cNear17.precision === V4_BASELINE_ORIGINAL17.C_NEAR.precision;

  const aReal = estimatorBlock(real.map((r) => ({ classification: r.aCls })));
  const bReal = estimatorBlock(real.map((r) => ({ classification: r.bCls })));

  const cNearReal = scoreRuleOutcomes(
    "C_NEAR",
    real.map((r) => r.cNear),
  );
  const ruleBReal = scoreRuleOutcomes(
    "RULE_B_OCTAVE_AMBIGUITY",
    real.map((r) => r.ruleB),
  );
  const cNearSynth = scoreRuleOutcomes(
    "C_NEAR",
    synth.map((r) => r.cNear),
  );
  const ruleBSynth = scoreRuleOutcomes(
    "RULE_B_OCTAVE_AMBIGUITY",
    synth.map((r) => r.ruleB),
  );

  const ruleBSafetyBroken = ruleBReal.autoWrong > 0;

  const falseAutoInventory = real
    .filter(
      (r) =>
        r.cNear.result.decision === "AUTO_ACCEPT" &&
        r.cNear.autoAcceptCorrect === false,
    )
    .map((r) => ({
      fixture: r.file,
      expected: r.expectedBpm,
      a: r.aBpm,
      b: r.bBpm,
      predicted: r.cNear.result.bpm,
      relation: r.relation,
      agreement: r.agreement,
      candidateSupport: r.candidateSupport,
      durationSec: r.durationSec,
      materialType: r.material,
      aConfidence: r.aConfidence,
      bConfidence: r.bConfidence,
      reason: r.cNear.result.reason,
      class: falseAutoClass(r.expectedBpm, r.cNear.result.bpm),
      octaveRel: octaveRelation(r.expectedBpm, r.cNear.result.bpm),
    }));

  const bands = [
    [70, 90],
    [91, 110],
    [111, 130],
    [131, 150],
    [151, 170],
    [171, 180],
  ] as const;

  const bandAnalysis = bands.map(([lo, hi]) => {
    const subset = real.filter(
      (r) => r.expectedBpm >= lo && r.expectedBpm <= hi,
    );
    const m = scoreRuleOutcomes(
      "C_NEAR",
      subset.map((r) => r.cNear),
    );
    const rb = scoreRuleOutcomes(
      "RULE_B_OCTAVE_AMBIGUITY",
      subset.map((r) => r.ruleB),
    );
    return {
      band: `${lo}-${hi}`,
      n: subset.length,
      bpms: [...new Set(subset.map((r) => r.expectedBpm))].sort(
        (a, b) => a - b,
      ),
      cNear: {
        precision: m.precision,
        coverage: m.coverage,
        falseAutoRate: m.falseAutoRate,
        auto: m.autoAccept,
        wrong: m.autoWrong,
      },
      ruleB: {
        precision: rb.precision,
        coverage: rb.coverage,
        falseAutoRate: rb.falseAutoRate,
        auto: rb.autoAccept,
        wrong: rb.autoWrong,
      },
    };
  });

  const priorityBpms = [135, 138, 148, 155, 170, 180];
  const priorityCoverage = priorityBpms.map((bpm) => {
    const hits = real.filter((r) => r.expectedBpm === bpm);
    return {
      bpm,
      count: hits.length,
      status: hits.length
        ? ("PRESENT" as const)
        : ("MISSING GOLDEN COVERAGE" as const),
      files: hits.map((h) => h.file),
    };
  });

  const materials: MaterialType[] = [
    "FULL_BEAT",
    "DRUM_LOOP",
    "MUSIC_LOOP",
    "MELODY_LOOP",
    "SPARSE",
    "DENSE",
    "UNKNOWN",
  ];
  const materialAnalysis = materials.map((mat) => {
    const subset = real.filter((r) => r.material === mat);
    const m = scoreRuleOutcomes(
      "C_NEAR",
      subset.map((r) => r.cNear),
    );
    const wrongs = falseAutoInventory.filter((f) => f.materialType === mat);
    return {
      material: mat,
      n: subset.length,
      cNearAuto: m.autoAccept,
      cNearWrong: m.autoWrong,
      falseAutoRate: m.falseAutoRate,
      falseAutoShareOfAll: falseAutoInventory.length
        ? +(wrongs.length / falseAutoInventory.length).toFixed(4)
        : null,
      note: "descriptive only — not causal",
    };
  });

  const addedFixtures = real
    .filter((r) => r.batch === "v5")
    .map((r) => ({
      file: r.file,
      expectedBpm: r.expectedBpm,
      material: r.material,
      durationSec: r.durationSec,
      format: r.format,
      sampleRate: r.sampleRate,
      channels: r.channels,
      genreStyle: r.layer,
      provenance: r.provenance,
    }));

  const bpmDistribution: Record<string, number> = {};
  for (const r of real) {
    const k = String(r.expectedBpm);
    bpmDistribution[k] = (bpmDistribution[k] || 0) + 1;
  }

  return {
    status: fixtures.length
      ? baselineOk
        ? ruleBSafetyBroken
          ? ("RULE_B_SAFETY_BROKEN" as const)
          : ("RAN" as const)
        : ("BASELINE_MISMATCH" as const)
      : ("BLOCKED" as const),
    previousCorpus: V4_REAL_COUNT,
    newCorpus: real.length,
    synthetic: synth.length,
    addedCount: addedFixtures.length,
    targetMinReal: 50,
    targetMet: real.length >= 50,
    baselineCheck: {
      ok: baselineOk,
      expected: V4_BASELINE_ORIGINAL17,
      observed: {
        A: { exact: a17.exact, within2: a17.within2, n: original17.length },
        B: { exact: b17.exact, within2: b17.within2, n: original17.length },
        C_NEAR: {
          auto: cNear17.autoAccept,
          precision: cNear17.precision,
          n: original17.length,
        },
      },
    },
    addedFixtures,
    bpmDistribution,
    materialCounts: Object.fromEntries(
      materials.map((m) => [m, real.filter((r) => r.material === m).length]),
    ),
    estimatorA: aReal,
    estimatorB: bReal,
    cNear: {
      real: {
        precision: cNearReal.precision,
        coverage: cNearReal.coverage,
        abstain: cNearReal.abstain,
        falseAutoRate: cNearReal.falseAutoRate,
        auto: cNearReal.autoAccept,
        wrong: cNearReal.autoWrong,
        correct: cNearReal.autoCorrect,
      },
      synthetic: {
        precision: cNearSynth.precision,
        coverage: cNearSynth.coverage,
        abstain: cNearSynth.abstain,
        falseAutoRate: cNearSynth.falseAutoRate,
        auto: cNearSynth.autoAccept,
        wrong: cNearSynth.autoWrong,
      },
    },
    ruleB: {
      real: {
        precision: ruleBReal.precision,
        coverage: ruleBReal.coverage,
        abstain: ruleBReal.abstain,
        falseAutoRate: ruleBReal.falseAutoRate,
        auto: ruleBReal.autoAccept,
        wrong: ruleBReal.autoWrong,
        correct: ruleBReal.autoCorrect,
        corpusSize: real.length,
        note: "0 false-auto in studied corpus only — not certified; confidence limited by corpus size/diversity",
      },
      synthetic: {
        precision: ruleBSynth.precision,
        coverage: ruleBSynth.coverage,
        abstain: ruleBSynth.abstain,
        falseAutoRate: ruleBSynth.falseAutoRate,
        auto: ruleBSynth.autoAccept,
        wrong: ruleBSynth.autoWrong,
      },
      safetyBroken: ruleBSafetyBroken,
    },
    falseAutoInventory,
    bandAnalysis,
    priorityCoverage,
    materialAnalysis,
    remainingGaps: priorityCoverage
      .filter((p) => p.status === "MISSING GOLDEN COVERAGE")
      .map((p) => p.bpm),
    certificationStatus: "ACCURACY NOT CERTIFIED",
  };
}
