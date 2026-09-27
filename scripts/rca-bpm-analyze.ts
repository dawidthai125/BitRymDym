/**
 * READ-ONLY BPM RCA analyzer (tooling only).
 * Does not change detector / ranking / threshold / product code.
 *
 * Usage: npx tsx scripts/rca-bpm-analyze.ts
 */

import fs from "node:fs";
import path from "node:path";

import { tempo } from "@audio/beat";
import decode from "audio-decode";

import {
  isHalfOrDouble,
  rankBpmCandidates,
  roundBpm,
} from "../src/lib/beats/audio-bpm-rank";
import { discoverBpmFixtures } from "../src/lib/beats/bpm-benchmark/discover";

const FIXTURES_DIR = path.resolve(process.cwd(), "..", "bitrymdym-fixtures");
const CANDIDATES_N = 8; // request more than prod (5) for coverage analysis

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

function harmonicRelation(expected: number, detected: number): string {
  if (detected === expected) return "exact";
  if (isHalfOrDouble(expected, detected)) {
    return detected < expected ? "half" : "double";
  }
  const ratio = detected / expected;
  const near = (r: number, t: number) => Math.abs(r - t) <= 0.06;
  if (near(ratio, 1.5)) return "×1.5";
  if (near(ratio, 2 / 3)) return "×2/3";
  if (near(ratio, 4 / 3)) return "×4/3";
  if (near(ratio, 3 / 2)) return "×3/2";
  if (near(ratio, 3 / 4)) return "×3/4";
  if (near(ratio, 5 / 4)) return "×5/4";
  if (near(ratio, 4 / 5)) return "×4/5";
  if (Math.abs(detected - expected) <= 2) return "neighbor";
  return "unrelated";
}

function expectedInList(
  expected: number,
  list: Array<{ bpm: number }>,
  tol = 1,
): { asTop: boolean; inTop3: boolean; inTop5: boolean; present: boolean; bestRank: number | null } {
  let bestRank: number | null = null;
  for (let i = 0; i < list.length; i++) {
    const b = roundBpm(list[i]!.bpm);
    if (b != null && Math.abs(b - expected) <= tol) {
      bestRank = i + 1;
      break;
    }
  }
  return {
    asTop: bestRank === 1,
    inTop3: bestRank != null && bestRank <= 3,
    inTop5: bestRank != null && bestRank <= 5,
    present: bestRank != null,
    bestRank,
  };
}

function classifyFailure(params: {
  expected: number;
  rawTop: number | null;
  rankedTop: number | null;
  rawList: Array<{ bpm: number; confidence: number }>;
}): string[] {
  const tags: string[] = [];
  const { expected, rawTop, rankedTop, rawList } = params;
  if (rawTop == null) {
    tags.push("G_candidate_absent");
    return tags;
  }
  const abs = Math.abs(rawTop - expected);
  const rel = harmonicRelation(expected, rawTop);
  if (rel === "exact") {
    tags.push("ok_exact");
  } else if (rel === "half") tags.push("A_half");
  else if (rel === "double") tags.push("B_double");
  else if (rel.startsWith("×")) tags.push("C_harmonic");
  else if (rel === "neighbor") tags.push("D_neighbor");
  else if (rel === "unrelated") tags.push("E_unrelated");
  else if (abs <= 2) tags.push("D_neighbor");

  const cov = expectedInList(expected, rawList, 1);
  if (cov.present && !cov.asTop) tags.push("F_candidate_present_ranked_below");
  if (!cov.present) tags.push("G_candidate_absent");

  if (rankedTop != null && rawTop !== rankedTop) {
    tags.push("rank_flipped");
  }
  return tags;
}

async function decodeFixture(absolutePath: string) {
  const bytes = fs.readFileSync(absolutePath);
  const audio = await decode(bytes);
  const channelData = audio.channelData as Float32Array[];
  return {
    samples: mixToMono(channelData),
    sampleRate: audio.sampleRate,
    channels: channelData.length,
    durationSec: (channelData[0]?.length ?? 0) / audio.sampleRate,
  };
}

function runTempo(
  samples: Float32Array,
  sampleRate: number,
  candidates = CANDIDATES_N,
) {
  const raw = tempo(samples, {
    fs: sampleRate,
    candidates,
    minBpm: 60,
    maxBpm: 200,
  }) as {
    bpm: number;
    confidence: number;
    candidates?: Array<{ bpm: number; confidence: number }>;
  };
  const list =
    Array.isArray(raw.candidates) && raw.candidates.length > 0
      ? raw.candidates.map((c) => ({
          bpm: c.bpm,
          confidence: c.confidence,
          bpmRounded: roundBpm(c.bpm),
        }))
      : [
          {
            bpm: raw.bpm,
            confidence: raw.confidence,
            bpmRounded: roundBpm(raw.bpm),
          },
        ];
  return {
    bpm: raw.bpm,
    confidence: raw.confidence,
    bpmRounded: roundBpm(raw.bpm),
    candidates: list,
  };
}

function segmentStability(
  samples: Float32Array,
  sampleRate: number,
  segmentSec: number,
) {
  const segLen = Math.floor(segmentSec * sampleRate);
  const segments: Array<{
    index: number;
    startSec: number;
    endSec: number;
    bpm: number | null;
    confidence: number;
  }> = [];
  let idx = 0;
  for (let start = 0; start + segLen <= samples.length; start += segLen) {
    const slice = samples.subarray(start, start + segLen);
    const r = runTempo(slice, sampleRate, 5);
    segments.push({
      index: idx++,
      startSec: +(start / sampleRate).toFixed(2),
      endSec: +((start + segLen) / sampleRate).toFixed(2),
      bpm: r.bpmRounded,
      confidence: +r.confidence.toFixed(3),
    });
  }
  const bpms = segments.map((s) => s.bpm).filter((b): b is number => b != null);
  const unique = [...new Set(bpms)];
  const mode =
    bpms.length === 0
      ? null
      : bpms.sort(
          (a, b) =>
            bpms.filter((x) => x === b).length -
            bpms.filter((x) => x === a).length,
        )[0]!;
  const modeShare =
    mode == null || bpms.length === 0
      ? 0
      : bpms.filter((b) => b === mode).length / bpms.length;
  return {
    segmentSec,
    segmentCount: segments.length,
    segments,
    uniqueBpms: unique,
    modeBpm: mode,
    modeShare: +modeShare.toFixed(3),
    stable: unique.length <= 1,
  };
}

async function main() {
  const fixtures = discoverBpmFixtures(FIXTURES_DIR).filter((f) =>
    ["RAP_BOOMBAP", "RAP_TRAP", "RAP_DRILL"].includes(f.layer),
  );

  const rows = [];
  const coverage = { asTop: 0, inTop3: 0, inTop5: 0, present: 0, absent: 0 };
  const failureCounts: Record<string, number> = {};
  const focus = [87, 88, 90, 100, 140, 142];

  for (const meta of fixtures) {
    const decoded = await decodeFixture(meta.absolutePath);
    const raw = runTempo(decoded.samples, decoded.sampleRate, CANDIDATES_N);
    const ranked = rankBpmCandidates(
      raw.candidates.map((c) => ({
        bpm: c.bpm,
        confidence: c.confidence,
      })),
    );
    const covTol1 = expectedInList(meta.expectedBpm, raw.candidates, 1);
    const covTol0 = expectedInList(meta.expectedBpm, raw.candidates, 0);

    if (covTol1.asTop) coverage.asTop++;
    if (covTol1.inTop3) coverage.inTop3++;
    if (covTol1.inTop5) coverage.inTop5++;
    if (covTol1.present) coverage.present++;
    else coverage.absent++;

    const tags = classifyFailure({
      expected: meta.expectedBpm,
      rawTop: raw.bpmRounded,
      rankedTop: ranked?.bpm ?? null,
      rawList: raw.candidates,
    });
    for (const t of tags) failureCounts[t] = (failureCounts[t] || 0) + 1;

    // Segment analysis for files long enough (≥ 4 × 8s)
    let segments8: ReturnType<typeof segmentStability> | null = null;
    let segments10: ReturnType<typeof segmentStability> | null = null;
    if (decoded.durationSec >= 32) {
      segments8 = segmentStability(decoded.samples, decoded.sampleRate, 8);
    }
    if (decoded.durationSec >= 40) {
      segments10 = segmentStability(decoded.samples, decoded.sampleRate, 10);
    }

    rows.push({
      file: meta.file,
      layer: meta.layer,
      expected: meta.expectedBpm,
      durationSec: +decoded.durationSec.toFixed(2),
      sampleRate: decoded.sampleRate,
      channels: decoded.channels,
      rawBpm: raw.bpmRounded,
      rawBpmFloat: +raw.bpm.toFixed(3),
      rawConfidence: +raw.confidence.toFixed(4),
      rawCandidates: raw.candidates.map((c) => ({
        bpm: +c.bpm.toFixed(3),
        rounded: c.bpmRounded,
        confidence: +c.confidence.toFixed(4),
      })),
      rankedBpm: ranked?.bpm ?? null,
      rankedConfidence: ranked?.confidence ?? null,
      rankedCandidates: (ranked?.candidates ?? []).slice(0, 8),
      rawEqualsRanked: raw.bpmRounded === ranked?.bpm,
      harmonic: harmonicRelation(meta.expectedBpm, raw.bpmRounded ?? -1),
      coverageTol1: covTol1,
      coverageExact: covTol0,
      failureTags: tags,
      focus: focus.includes(meta.expectedBpm),
      segments8,
      segments10,
    });
  }

  const n = rows.length;
  const out = {
    meta: {
      note: "READ-ONLY RCA — no product code changes",
      candidatesRequested: CANDIDATES_N,
      productionUsesCandidates: 5,
      confidenceSemantics:
        "@audio/beat-tempo: ACF(ODF)/r0 × log-Gaussian(~120BPM), then max-normalized to [0,1] across all lags. confidence=1 means strongest weighted lag, NOT calibrated P(correct BPM).",
      n,
    },
    candidateCoverageTol1: {
      asTop: coverage.asTop,
      asTopPct: +((coverage.asTop / n) * 100).toFixed(1),
      inTop3: coverage.inTop3,
      inTop3Pct: +((coverage.inTop3 / n) * 100).toFixed(1),
      inTop5: coverage.inTop5,
      inTop5Pct: +((coverage.inTop5 / n) * 100).toFixed(1),
      present: coverage.present,
      presentPct: +((coverage.present / n) * 100).toFixed(1),
      absent: coverage.absent,
      absentPct: +((coverage.absent / n) * 100).toFixed(1),
    },
    failureTagCounts: failureCounts,
    harmonicCounts: rows.reduce(
      (acc, r) => {
        acc[r.harmonic] = (acc[r.harmonic] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    rawEqualsRankedCount: rows.filter((r) => r.rawEqualsRanked).length,
    focusRows: rows.filter((r) => r.focus),
    allRows: rows,
    segmentSummary: rows
      .filter((r) => r.segments8 || r.segments10)
      .map((r) => ({
        file: r.file,
        expected: r.expected,
        fullTrackRaw: r.rawBpm,
        seg8: r.segments8
          ? {
              unique: r.segments8.uniqueBpms,
              mode: r.segments8.modeBpm,
              modeShare: r.segments8.modeShare,
              stable: r.segments8.stable,
              segments: r.segments8.segments,
            }
          : null,
        seg10: r.segments10
          ? {
              unique: r.segments10.uniqueBpms,
              mode: r.segments10.modeBpm,
              modeShare: r.segments10.modeShare,
              stable: r.segments10.stable,
              segments: r.segments10.segments,
            }
          : null,
      })),
  };

  const outPath = path.join(
    process.env.TEMP ?? "/tmp",
    "bpm-rca-analysis.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        outPath,
        candidateCoverageTol1: out.candidateCoverageTol1,
        failureTagCounts: out.failureTagCounts,
        harmonicCounts: out.harmonicCounts,
        rawEqualsRankedCount: out.rawEqualsRankedCount,
        segmentSummary: out.segmentSummary,
        focusCompact: out.focusRows.map((r) => ({
          file: r.file,
          e: r.expected,
          raw: r.rawBpm,
          c: r.rawConfidence,
          harmonic: r.harmonic,
          cov: r.coverageTol1,
          tags: r.failureTags,
          cands: r.rawCandidates.map(
            (c) => `${c.rounded ?? "?"}@${c.confidence}`,
          ),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
