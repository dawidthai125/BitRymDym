/**
 * Experiment V4 runner — golden validation of C_NEAR safety.
 * Reuses V2 estimators + V3 C_NEAR. Single PCM decode per fixture.
 */

import fs from "node:fs";

import decode from "audio-decode";

import {
  classifyExperimentMatch,
  isExperimentCorrect,
} from "@/lib/beats/bpm-experiment-v2/classify";
import {
  runEstimatorA,
  runEstimatorB,
  type ExperimentEstimatorResult,
} from "@/lib/beats/bpm-experiment-v2/estimators";
import {
  DEFAULT_BPM_FIXTURES_DIR,
  discoverBpmFixtures,
} from "@/lib/beats/bpm-benchmark/discover";
import {
  ALL_SAFETY_RULES,
  analyzePair,
  candidateIntersectionCount,
  hasOctaveAmbiguityInCandidates,
  octaveRelation,
  runSafetyRule,
  type SafetyRuleId,
} from "@/lib/beats/bpm-experiment-v4/rules";
import {
  classifyAgreementWrong,
  outcomeForRule,
  scoreRuleOutcomes,
  type AgreementWrongKind,
  type RuleFixtureOutcome,
  type RuleMetrics,
} from "@/lib/beats/bpm-experiment-v4/metrics";

/** V2/V3 published REAL baselines — must match on the ORIGINAL 17 files. */
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

const V2_REAL_BASELINE = {
  A: { exact: 4, within2: 8, n: 17 },
  B: { exact: 8, within2: 10, n: 17 },
  C_NEAR: { auto: 7, precision: 0.8571, n: 17 },
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

function expectedCandidateStatus(
  expected: number,
  candidates: ExperimentEstimatorResult["candidates"],
  top: number | null,
): "absent" | "top" | "below_top" | "harmonic_of_top" {
  if (!candidates?.length || top == null) return "absent";
  if (Math.abs(top - expected) <= 1) return "top";
  const rank = candidates.findIndex((c) => {
    const r = c.bpmRounded;
    return r != null && Math.abs(r - expected) <= 1;
  });
  if (rank === 0) return "top";
  if (rank > 0) return "below_top";
  if (isHalfOrDoubleLocal(top, expected)) return "harmonic_of_top";
  return "absent";
}

function isHalfOrDoubleLocal(a: number, b: number): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return Math.abs(hi - lo * 2) <= 1;
}

type SegmentStability = "STABLE_CORRECT" | "STABLE_WRONG" | "UNSTABLE" | "TOO_SHORT";

function segmentRun(
  samples: Float32Array,
  sampleRate: number,
  segmentSec: number,
  which: "A" | "B",
  expected: number,
): {
  segmentSec: number;
  bpms: Array<number | null>;
  uniqueBpms: number[];
  stability: SegmentStability;
  note?: string;
} {
  const segLen = Math.floor(segmentSec * sampleRate);
  const need = segLen * 4;
  if (samples.length < need) {
    return {
      segmentSec,
      bpms: [],
      uniqueBpms: [],
      stability: "TOO_SHORT",
      note: `need ${need} samples for 4×${segmentSec}s; have ${samples.length}`,
    };
  }
  const bpms: Array<number | null> = [];
  for (let i = 0; i < 4; i++) {
    const start = i * segLen;
    const slice = samples.subarray(start, start + segLen);
    const r =
      which === "A"
        ? runEstimatorA(slice, sampleRate)
        : runEstimatorB(slice, sampleRate);
    bpms.push(r.rawTopBpm);
  }
  const present = bpms.filter((b): b is number => b != null);
  const unique = [...new Set(present)];
  if (unique.length !== 1 || present.length < 4) {
    return { segmentSec, bpms, uniqueBpms: unique, stability: "UNSTABLE" };
  }
  const mode = unique[0]!;
  const ok = isExperimentCorrect(
    classifyExperimentMatch({ expectedBpm: expected, detectedBpm: mode }),
  );
  return {
    segmentSec,
    bpms,
    uniqueBpms: unique,
    stability: ok ? "STABLE_CORRECT" : "STABLE_WRONG",
  };
}

export type FixtureV4Row = {
  file: string;
  layer: string;
  expectedBpm: number;
  format: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  aBpm: number | null;
  bBpm: number | null;
  aConfidence: number | null;
  bConfidence: number | null;
  aDetectionMs: number;
  bDetectionMs: number;
  agreement: string;
  octaveRel: ReturnType<typeof octaveRelation>;
  candidateIntersection: number;
  expectedInA: string;
  expectedInB: string;
  octaveAmbiguityInCandidates: boolean;
  ruleOutcomes: Record<SafetyRuleId, RuleFixtureOutcome>;
};

export async function runBpmExperimentV4(params?: { fixturesDir?: string }) {
  const fixturesDir = params?.fixturesDir ?? DEFAULT_BPM_FIXTURES_DIR;
  const fixtures = discoverBpmFixtures(fixturesDir);

  const rows: FixtureV4Row[] = [];
  const pcmByFile = new Map<
    string,
    {
      samples: Float32Array;
      sampleRate: number;
      channels: number;
      durationSec: number;
      format: string;
    }
  >();

  for (const meta of fixtures) {
    const bytes = fs.readFileSync(meta.absolutePath);
    const audio = await decode(bytes);
    const channelData = audio.channelData as Float32Array[];
    const samples = mixToMono(channelData);
    const durationSec = samples.length / audio.sampleRate;
    const format = meta.file.toLowerCase().endsWith(".wav") ? "wav" : "mp3";

    pcmByFile.set(meta.file, {
      samples,
      sampleRate: audio.sampleRate,
      channels: channelData.length,
      durationSec,
      format,
    });

    const a = runEstimatorA(samples, audio.sampleRate);
    const b = runEstimatorB(samples, audio.sampleRate);
    const pair = analyzePair({ a, b, expectedBpm: meta.expectedBpm });

    const agreed =
      pair.agreement === "AGREEMENT" || pair.agreement === "NEAR_AGREEMENT"
        ? Math.round(((pair.aBpm ?? 0) + (pair.bBpm ?? 0)) / 2)
        : (pair.aBpm ?? pair.bBpm);

    const ruleOutcomes = {} as Record<SafetyRuleId, RuleFixtureOutcome>;
    for (const id of ALL_SAFETY_RULES) {
      const result = runSafetyRule(id, {
        pair,
        a,
        b,
        durationSec,
      });
      ruleOutcomes[id] = outcomeForRule({
        file: meta.file,
        layer: meta.layer,
        expectedBpm: meta.expectedBpm,
        result,
      });
    }

    rows.push({
      file: meta.file,
      layer: meta.layer,
      expectedBpm: meta.expectedBpm,
      format,
      durationSec: +durationSec.toFixed(3),
      sampleRate: audio.sampleRate,
      channels: channelData.length,
      aBpm: a.rawTopBpm,
      bBpm: b.rawTopBpm,
      aConfidence: a.confidence,
      bConfidence: b.confidence,
      aDetectionMs: a.detectionMs,
      bDetectionMs: b.detectionMs,
      agreement: pair.agreement,
      octaveRel: octaveRelation(meta.expectedBpm, agreed ?? null),
      candidateIntersection: candidateIntersectionCount(a, b),
      expectedInA: expectedCandidateStatus(
        meta.expectedBpm,
        a.candidates,
        a.rawTopBpm,
      ),
      expectedInB: expectedCandidateStatus(
        meta.expectedBpm,
        b.candidates,
        b.rawTopBpm,
      ),
      octaveAmbiguityInCandidates:
        agreed != null
          ? hasOctaveAmbiguityInCandidates(agreed, a, b)
          : false,
      ruleOutcomes,
    });
  }

  const isSynth = (r: FixtureV4Row) => r.layer === "SYNTHETIC";
  const realAll = rows.filter((r) => !isSynth(r));
  const synth = rows.filter(isSynth);
  const original17 = realAll.filter((r) =>
    (V2_ORIGINAL_REAL_FILES as readonly string[]).includes(r.file),
  );
  const goldenNew = realAll.filter(
    (r) => !(V2_ORIGINAL_REAL_FILES as readonly string[]).includes(r.file),
  );

  // Baseline consistency on original 17
  let aExact = 0;
  let aW2 = 0;
  let bExact = 0;
  let bW2 = 0;
  for (const r of original17) {
    const aCls = classifyExperimentMatch({
      expectedBpm: r.expectedBpm,
      detectedBpm: r.aBpm,
    });
    const bCls = classifyExperimentMatch({
      expectedBpm: r.expectedBpm,
      detectedBpm: r.bBpm,
    });
    if (aCls === "EXACT") aExact++;
    if (isExperimentCorrect(aCls)) aW2++;
    if (bCls === "EXACT") bExact++;
    if (isExperimentCorrect(bCls)) bW2++;
  }
  const cNearOrig = scoreRuleOutcomes(
    "C_NEAR",
    original17.map((r) => r.ruleOutcomes.C_NEAR),
  );
  const baselineOk =
    aExact === V2_REAL_BASELINE.A.exact &&
    aW2 === V2_REAL_BASELINE.A.within2 &&
    bExact === V2_REAL_BASELINE.B.exact &&
    bW2 === V2_REAL_BASELINE.B.within2 &&
    cNearOrig.autoAccept === V2_REAL_BASELINE.C_NEAR.auto &&
    cNearOrig.precision === V2_REAL_BASELINE.C_NEAR.precision &&
    original17.length === 17;

  // Agreement-but-wrong (exact A==B only, on all real)
  const agreementCases = realAll.filter((r) => r.agreement === "AGREEMENT");
  const agreementButWrong = [];
  for (const r of agreementCases) {
    if (r.aBpm == null) continue;
    const wrong =
      !isExperimentCorrect(
        classifyExperimentMatch({
          expectedBpm: r.expectedBpm,
          detectedBpm: r.aBpm,
        }),
      );
    if (!wrong) continue;

    const predicted = r.aBpm;
    const wrongKind: AgreementWrongKind = classifyAgreementWrong(
      r.expectedBpm,
      predicted,
    );
    const pcm = pcmByFile.get(r.file)!;
    let segSec = 10;
    if (pcm.durationSec < 40) segSec = 8;
    if (pcm.durationSec < segSec * 4) {
      segSec = Math.max(2, Math.floor((pcm.durationSec / 4) * 10) / 10);
    }
    const aEst = runEstimatorA(pcm.samples, pcm.sampleRate);
    const bEst = runEstimatorB(pcm.samples, pcm.sampleRate);
    agreementButWrong.push({
      file: r.file,
      expected: r.expectedBpm,
      predicted,
      wrongKind,
      octaveRel: r.octaveRel,
      durationSec: r.durationSec,
      sampleRate: r.sampleRate,
      channels: r.channels,
      format: r.format,
      aConfidence: r.aConfidence,
      bConfidence: r.bConfidence,
      expectedInA: r.expectedInA,
      expectedInB: r.expectedInB,
      aCandidates: (aEst.candidates ?? []).slice(0, 8).map((c) => ({
        bpm: c.bpmRounded,
        conf: c.confidence,
      })),
      bCandidates: (bEst.candidates ?? []).slice(0, 8).map((c) => ({
        bpm: c.bpmRounded,
        conf: c.confidence,
      })),
      octaveAmbiguityInCandidates: r.octaveAmbiguityInCandidates,
      segmentA: segmentRun(
        pcm.samples,
        pcm.sampleRate,
        segSec,
        "A",
        r.expectedBpm,
      ),
      segmentB: segmentRun(
        pcm.samples,
        pcm.sampleRate,
        segSec,
        "B",
        r.expectedBpm,
      ),
      signalNotes: {
        short: r.durationSec < 12,
        octaveAmbiguous: r.octaveRel === "x2" || r.octaveRel === "x0_5",
      },
    });
  }

  // All exact-agreement cases (correct + wrong) for octave analysis
  const agreementAnalysis = agreementCases.map((r) => ({
    file: r.file,
    expected: r.expectedBpm,
    predicted: r.aBpm,
    correct: isExperimentCorrect(
      classifyExperimentMatch({
        expectedBpm: r.expectedBpm,
        detectedBpm: r.aBpm,
      }),
    ),
    octaveRel: r.octaveRel,
    durationSec: r.durationSec,
    expectedInA: r.expectedInA,
    expectedInB: r.expectedInB,
    octaveAmbiguityInCandidates: r.octaveAmbiguityInCandidates,
  }));

  function metricsFor(subset: FixtureV4Row[]): Record<SafetyRuleId, RuleMetrics> {
    const out = {} as Record<SafetyRuleId, RuleMetrics>;
    for (const id of ALL_SAFETY_RULES) {
      out[id] = scoreRuleOutcomes(
        id,
        subset.map((r) => r.ruleOutcomes[id]),
      );
    }
    return out;
  }

  // C_NEAR AUTO detail (REAL all)
  const cNearAutoDetail = realAll
    .filter((r) => r.ruleOutcomes.C_NEAR.result.decision === "AUTO_ACCEPT")
    .map((r) => ({
      file: r.file,
      expected: r.expectedBpm,
      a: r.aBpm,
      b: r.bBpm,
      aConf: r.aConfidence,
      bConf: r.bConfidence,
      bpm: r.ruleOutcomes.C_NEAR.result.bpm,
      correct: r.ruleOutcomes.C_NEAR.autoAcceptCorrect,
      cls: r.ruleOutcomes.C_NEAR.classification,
      candidateIntersection: r.candidateIntersection,
      expectedInA: r.expectedInA,
      expectedInB: r.expectedInB,
      octaveRel: r.octaveRel,
      octaveAmbiguityInCandidates: r.octaveAmbiguityInCandidates,
      durationSec: r.durationSec,
    }));

  // BPM band coverage (real golden)
  const bands = [
    [70, 80],
    [81, 90],
    [91, 100],
    [101, 110],
    [111, 120],
    [121, 130],
    [131, 140],
    [141, 150],
    [151, 160],
    [161, 180],
  ] as const;
  const bandCoverage = bands.map(([lo, hi]) => {
    const hits = realAll.filter(
      (r) => r.expectedBpm >= lo && r.expectedBpm <= hi,
    );
    return {
      band: `${lo}-${hi}`,
      count: hits.length,
      bpms: [...new Set(hits.map((r) => r.expectedBpm))].sort((a, b) => a - b),
    };
  });

  const priorityBpms = [
    90, 100, 120, 130, 135, 138, 140, 142, 145, 148, 150, 155, 160, 170, 180,
  ];
  const priorityCoverage = priorityBpms.map((bpm) => ({
    bpm,
    count: realAll.filter((r) => r.expectedBpm === bpm).length,
  }));

  // Certification heuristic (technical, not marketing)
  const realMetrics = metricsFor(realAll);
  const cNear = realMetrics.C_NEAR;
  const falseAuto = cNear.falseAutoRate ?? 1;
  let certification: "A" | "B" | "C" = "B";
  if (
    realAll.length >= 30 &&
    (cNear.precision ?? 0) >= 0.95 &&
    falseAuto <= 0.05 &&
    (cNear.coverage ?? 0) >= 0.35
  ) {
    certification = "A";
  } else if (
    (cNear.precision ?? 0) < 0.7 ||
    falseAuto > 0.25 ||
    agreementButWrong.length >= 3
  ) {
    // Still B by default unless clearly unsafe at coverage that would ship
    if ((cNear.coverage ?? 0) >= 0.5 && falseAuto > 0.2) {
      certification = "C";
    } else {
      certification = "B";
    }
  }

  return {
    status: fixtures.length
      ? baselineOk
        ? ("RAN" as const)
        : ("BASELINE_MISMATCH" as const)
      : ("BLOCKED" as const),
    fixturesDir,
    golden: {
      availableGoldenFixtures: realAll.length,
      original17: original17.length,
      goldenNew: goldenNew.length,
      synthetic: synth.length,
      targetMinReal: 30,
      targetMet: realAll.length >= 30,
      provenance:
        "Freesound CC0 / Public Domain HQ MP3 previews; BPM from source title/description/manifest — never from A/B detectors",
      bandCoverage,
      priorityCoverage,
    },
    baselineCheck: {
      ok: baselineOk,
      expected: V2_REAL_BASELINE,
      observed: {
        A: { exact: aExact, within2: aW2, n: original17.length },
        B: { exact: bExact, within2: bW2, n: original17.length },
        C_NEAR: {
          auto: cNearOrig.autoAccept,
          precision: cNearOrig.precision,
          n: original17.length,
        },
      },
    },
    agreementAnalysis: {
      exactAgreementCount: agreementCases.length,
      agreementButWrongCount: agreementButWrong.length,
      agreementButWrong,
      allAgreements: agreementAnalysis,
    },
    cNearSafety: {
      original17: cNearOrig,
      realAll: realMetrics.C_NEAR,
      synthetic: metricsFor(synth).C_NEAR,
      autoDetailReal: cNearAutoDetail,
    },
    ruleMetrics: {
      realAll: realMetrics,
      original17: metricsFor(original17),
      goldenNew: metricsFor(goldenNew),
      synthetic: metricsFor(synth),
    },
    certificationQuestion: {
      answer: certification,
      meaning: {
        A: "AUTO-SUGGEST SAFE ENOUGH FOR PRODUCTION",
        B: "AUTO-SUGGEST PROMISING BUT MORE GOLDEN DATA REQUIRED",
        C: "AUTO-SUGGEST UNSAFE",
      }[certification],
      rationale:
        certification === "A"
          ? "≥30 golden, precision≥95%, false-auto≤5%, coverage≥35%"
          : certification === "C"
            ? "High coverage with high false-auto rate — would ship wrong autos often"
            : "Default: promising architecture (C_NEAR) but agreement≠truth remains; corpus / false-auto not yet certifiable",
    },
  };
}
