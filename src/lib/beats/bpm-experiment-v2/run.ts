/**
 * Experiment V2 runner — A vs B on same PCM. Tooling only.
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
  type ExperimentEstimatorId,
  type ExperimentEstimatorResult,
} from "@/lib/beats/bpm-experiment-v2/estimators";
import {
  DEFAULT_BPM_FIXTURES_DIR,
  discoverBpmFixtures,
} from "@/lib/beats/bpm-benchmark/discover";
import type { FixtureMeta } from "@/lib/beats/bpm-benchmark/types";

export type ExperimentRow = {
  file: string;
  layer: string;
  genre: string;
  format: string;
  expectedBpm: number;
  estimator: ExperimentEstimatorId;
  method: string;
  rawTopBpm: number | null;
  normalizedBpm: number | null;
  confidence: number | null;
  candidates: ExperimentEstimatorResult["candidates"];
  decodeMs: number;
  detectionMs: number;
  totalMs: number;
  errorAbsolute: number | null;
  classification: ExperimentClassification;
  coverageRank: number | null;
  errorMessage?: string;
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

function coverageRank(
  expected: number,
  candidates: ExperimentEstimatorResult["candidates"],
  tol = 1,
): number | null {
  if (!candidates?.length) return null;
  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i]!.bpmRounded;
    if (r != null && Math.abs(r - expected) <= tol) return i + 1;
  }
  return null;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function rateBlock(rows: ExperimentRow[]) {
  const n = rows.length;
  const cls: Record<string, number> = {};
  for (const r of rows) cls[r.classification] = (cls[r.classification] || 0) + 1;
  const exact = rows.filter((r) => r.classification === "EXACT").length;
  const w1 = rows.filter((r) =>
    ["EXACT", "WITHIN_1"].includes(r.classification),
  ).length;
  const w2 = rows.filter((r) => isExperimentCorrect(r.classification)).length;
  const halfDouble = rows.filter((r) => isHalfDouble(r.classification)).length;
  const harmonic = rows.filter((r) => isHarmonic(r.classification)).length;
  const miss = rows.filter((r) => r.classification === "MISS").length;
  const withCand = rows.filter((r) => r.candidates != null);
  const top1 = withCand.filter((r) => r.coverageRank === 1).length;
  const top3 = withCand.filter(
    (r) => r.coverageRank != null && r.coverageRank <= 3,
  ).length;
  const top5 = withCand.filter(
    (r) => r.coverageRank != null && r.coverageRank <= 5,
  ).length;
  const times = rows.map((r) => r.detectionMs).sort((a, b) => a - b);
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  return {
    n,
    exact,
    exactRate: n ? +(exact / n).toFixed(4) : 0,
    within1: w1,
    within1Rate: n ? +(w1 / n).toFixed(4) : 0,
    within2: w2,
    within2Rate: n ? +(w2 / n).toFixed(4) : 0,
    halfDouble,
    harmonic,
    miss,
    classificationCounts: cls,
    coverage: {
      withCandidates: withCand.length,
      top1,
      top1Rate: withCand.length ? +(top1 / withCand.length).toFixed(4) : null,
      top3,
      top3Rate: withCand.length ? +(top3 / withCand.length).toFixed(4) : null,
      top5,
      top5Rate: withCand.length ? +(top5 / withCand.length).toFixed(4) : null,
    },
    perf: {
      avgDetectionMs: +avg(times).toFixed(1),
      p95DetectionMs: percentile(times, 95),
      maxDetectionMs: times.length ? times[times.length - 1]! : null,
      avgDecodeMs: +avg(rows.map((r) => r.decodeMs)).toFixed(1),
      avgTotalMs: +avg(rows.map((r) => r.totalMs)).toFixed(1),
      maxTotalMs: Math.max(0, ...rows.map((r) => r.totalMs)),
    },
  };
}

function buildRow(
  meta: FixtureMeta,
  est: ExperimentEstimatorResult,
  decodeMs: number,
): ExperimentRow {
  // Experiment reports raw detector top as both raw and "normalized"
  // (no production rankBpmCandidates applied — isolates estimator difference).
  const normalizedBpm = est.rawTopBpm;
  const errorAbsolute =
    normalizedBpm != null
      ? Math.abs(normalizedBpm - meta.expectedBpm)
      : null;
  return {
    file: meta.file,
    layer: meta.layer,
    genre: meta.genre,
    format: meta.format,
    expectedBpm: meta.expectedBpm,
    estimator: est.estimator,
    method: est.method,
    rawTopBpm: est.rawTopBpm,
    normalizedBpm,
    confidence: est.confidence,
    candidates: est.candidates,
    decodeMs,
    detectionMs: est.detectionMs,
    totalMs: decodeMs + est.detectionMs,
    errorAbsolute,
    classification: classifyExperimentMatch({
      expectedBpm: meta.expectedBpm,
      detectedBpm: normalizedBpm,
    }),
    coverageRank: coverageRank(meta.expectedBpm, est.candidates, 1),
    errorMessage: est.errorMessage,
  };
}

function segmentRun(
  samples: Float32Array,
  sampleRate: number,
  segmentSec: number,
  which: "A" | "B",
) {
  const segLen = Math.floor(segmentSec * sampleRate);
  const out: Array<{
    index: number;
    startSec: number;
    endSec: number;
    bpm: number | null;
    confidence: number | null;
  }> = [];
  let idx = 0;
  for (let start = 0; start + segLen <= samples.length; start += segLen) {
    const slice = samples.subarray(start, start + segLen);
    const r =
      which === "A"
        ? runEstimatorA(slice, sampleRate)
        : runEstimatorB(slice, sampleRate);
    out.push({
      index: idx++,
      startSec: +(start / sampleRate).toFixed(2),
      endSec: +((start + segLen) / sampleRate).toFixed(2),
      bpm: r.rawTopBpm,
      confidence: r.confidence,
    });
  }
  const bpms = out.map((s) => s.bpm).filter((b): b is number => b != null);
  const unique = [...new Set(bpms)];
  return {
    segmentSec,
    segments: out,
    uniqueBpms: unique,
    stable: unique.length <= 1,
    stableCorrect: false as boolean,
    stableWrong: false as boolean,
    unstable: unique.length > 1,
  };
}

export async function runBpmExperimentV2(params?: {
  fixturesDir?: string;
}) {
  const fixturesDir = params?.fixturesDir ?? DEFAULT_BPM_FIXTURES_DIR;
  const fixtures = discoverBpmFixtures(fixturesDir);
  const rows: ExperimentRow[] = [];
  const pcmCache = new Map<
    string,
    { samples: Float32Array; sampleRate: number; decodeMs: number; durationSec: number }
  >();

  for (const meta of fixtures) {
    const t0 = performance.now();
    const bytes = fs.readFileSync(meta.absolutePath);
    const audio = await decode(bytes);
    const channelData = audio.channelData as Float32Array[];
    const samples = mixToMono(channelData);
    const decodeMs = Math.round(performance.now() - t0);
    const durationSec = samples.length / audio.sampleRate;
    pcmCache.set(meta.file, {
      samples,
      sampleRate: audio.sampleRate,
      decodeMs,
      durationSec,
    });

    const a = runEstimatorA(samples, audio.sampleRate);
    const b = runEstimatorB(samples, audio.sampleRate);
    rows.push(buildRow(meta, a, decodeMs));
    rows.push(buildRow(meta, b, decodeMs));
  }

  const rowsA = rows.filter((r) => r.estimator === "A_tempo");
  const rowsB = rows.filter((r) => r.estimator === "B_combTempo");
  const realA = rowsA.filter((r) => r.layer !== "SYNTHETIC");
  const realB = rowsB.filter((r) => r.layer !== "SYNTHETIC");
  const synthA = rowsA.filter((r) => r.layer === "SYNTHETIC");
  const synthB = rowsB.filter((r) => r.layer === "SYNTHETIC");

  // Correlation on real: pair by file
  const correlation = {
    bothCorrect: 0,
    aWrongBCorrect: 0,
    aCorrectBWrong: 0,
    bothWrong: 0,
    pairs: [] as Array<{
      file: string;
      expected: number;
      a: number | null;
      b: number | null;
      aCls: ExperimentClassification;
      bCls: ExperimentClassification;
      aCorrect: boolean;
      bCorrect: boolean;
    }>,
  };

  for (const a of realA) {
    const b = realB.find((x) => x.file === a.file);
    if (!b) continue;
    const aOk = isExperimentCorrect(a.classification);
    const bOk = isExperimentCorrect(b.classification);
    if (aOk && bOk) correlation.bothCorrect++;
    else if (!aOk && bOk) correlation.aWrongBCorrect++;
    else if (aOk && !bOk) correlation.aCorrectBWrong++;
    else correlation.bothWrong++;
    correlation.pairs.push({
      file: a.file,
      expected: a.expectedBpm,
      a: a.normalizedBpm,
      b: b.normalizedBpm,
      aCls: a.classification,
      bCls: b.classification,
      aCorrect: aOk,
      bCorrect: bOk,
    });
  }

  const focusFiles = [
    "rap-boombap-90-fs680221.mp3",
    "rap-trap-140-fs456135.mp3",
    "rap-boombap-142-fs838789.mp3",
  ];

  const segments = [];
  for (const file of focusFiles) {
    const pcm = pcmCache.get(file);
    const meta = fixtures.find((f) => f.file === file);
    if (!pcm || !meta) continue;
    // Prefer 10s / 8s; fall back to duration/4 so short loops still get 4 windows.
    let segSec = 10;
    if (pcm.durationSec < 40) segSec = 8;
    if (pcm.durationSec < segSec * 4) {
      segSec = Math.max(3, Math.floor((pcm.durationSec / 4) * 10) / 10);
    }
    if (pcm.durationSec < segSec * 4) continue;
    const aSeg = segmentRun(pcm.samples, pcm.sampleRate, segSec, "A");
    const bSeg = segmentRun(pcm.samples, pcm.sampleRate, segSec, "B");
    for (const s of [aSeg, bSeg]) {
      const mode = s.uniqueBpms.length === 1 ? s.uniqueBpms[0]! : null;
      const modeOk =
        mode != null &&
        isExperimentCorrect(
          classifyExperimentMatch({
            expectedBpm: meta.expectedBpm,
            detectedBpm: mode,
          }),
        );
      s.stableCorrect = s.stable && modeOk;
      s.stableWrong = s.stable && !modeOk;
    }
    segments.push({
      file,
      expected: meta.expectedBpm,
      segmentSec: segSec,
      A: aSeg,
      B: bSeg,
      fullA: realA.find((r) => r.file === file)?.normalizedBpm ?? null,
      fullB: realB.find((r) => r.file === file)?.normalizedBpm ?? null,
    });
  }

  const specialFixes = {
    "90to120": correlation.pairs
      .filter((p) => p.expected === 90)
      .map((p) => ({
        file: p.file,
        a: p.a,
        b: p.b,
        aCls: p.aCls,
        bCls: p.bCls,
      })),
    "140to112": correlation.pairs
      .filter((p) => p.file.includes("456135") || (p.expected === 140 && p.a === 112))
      .map((p) => ({
        file: p.file,
        a: p.a,
        b: p.b,
        aCls: p.aCls,
        bCls: p.bCls,
      })),
    "142to71": correlation.pairs
      .filter((p) => p.expected === 142)
      .map((p) => ({
        file: p.file,
        a: p.a,
        b: p.b,
        aCls: p.aCls,
        bCls: p.bCls,
      })),
    aAbsentRecoveredByB: correlation.pairs.filter((p) => {
      const aRow = realA.find((r) => r.file === p.file);
      return (
        aRow != null &&
        (aRow.coverageRank == null || aRow.coverageRank > 5) &&
        p.bCorrect
      );
    }),
  };

  const comparisonTable = {
    REAL: {
      A: rateBlock(realA),
      B: rateBlock(realB),
    },
    SYNTHETIC: {
      A: rateBlock(synthA),
      B: rateBlock(synthB),
    },
    REAL_87_105: {
      A: rateBlock(
        realA.filter((r) => r.expectedBpm >= 87 && r.expectedBpm <= 105),
      ),
      B: rateBlock(
        realB.filter((r) => r.expectedBpm >= 87 && r.expectedBpm <= 105),
      ),
    },
    REAL_130_150: {
      A: rateBlock(
        realA.filter((r) => r.expectedBpm >= 130 && r.expectedBpm <= 150),
      ),
      B: rateBlock(
        realB.filter((r) => r.expectedBpm >= 130 && r.expectedBpm <= 150),
      ),
    },
  };

  return {
    status: fixtures.length ? ("RAN" as const) : ("BLOCKED" as const),
    fixturesDir,
    fixtureCount: fixtures.length,
    estimatorA: {
      id: "A_tempo",
      package: "@audio/beat@2.1.3 → @audio/beat-tempo",
      method: "ACF(ODF) + ~120 prior + max-norm",
    },
    estimatorB: {
      id: "B_combTempo",
      package: "@audio/beat@2.1.3 → @audio/beat-tempo/comb",
      method: "comb-filter(ODF+harmonics) + ~120 prior + max-norm",
      license: "MIT",
      vercelCompatible: true,
      newDependency: false,
      independenceNote:
        "Different scoring (comb vs ACF) but shares spectral-flux ODF + ~120 BPM perceptual prior + max-norm + octave suppress.",
    },
    note: "Experiment does NOT apply production rankBpmCandidates — compares raw estimator tops only.",
    comparisonTable,
    correlation,
    specialFixes,
    segments,
    rows,
  };
}
