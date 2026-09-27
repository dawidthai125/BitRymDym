/**
 * Run BPM benchmark against discovered fixtures.
 * Uses the same decode + @audio/beat + rank algorithms as production,
 * without importing `server-only` modules (so CLI `tsx` works).
 * Does not change detector thresholds or DB.
 */

import fs from "node:fs";

import { tempo } from "@audio/beat";
import decode from "audio-decode";

import {
  rankBpmCandidates,
  roundBpm,
} from "@/lib/beats/audio-bpm-rank";
import {
  DEFAULT_BPM_FIXTURES_DIR,
  discoverBpmFixtures,
} from "@/lib/beats/bpm-benchmark/discover";
import { buildBenchmarkRow } from "@/lib/beats/bpm-benchmark/evaluate";
import {
  confidenceBuckets,
  summarizeByGenre,
  summarizeByLayer,
  sweepConfidenceThresholds,
} from "@/lib/beats/bpm-benchmark/summary";
import type {
  BenchmarkRow,
  FixtureMeta,
} from "@/lib/beats/bpm-benchmark/types";

const DECODE_MIME = ["audio/mpeg", "audio/wav", "audio/x-wav"] as const;

function isDecodeSupported(contentType: string): boolean {
  return (DECODE_MIME as readonly string[]).includes(contentType);
}

export type BenchmarkRunResult = {
  status: "RAN" | "BLOCKED";
  fixturesDir: string;
  fixtureCount: number;
  rows: BenchmarkRow[];
  byLayer: ReturnType<typeof summarizeByLayer>;
  byGenre: ReturnType<typeof summarizeByGenre>;
  confidence045: ReturnType<typeof confidenceBuckets>;
  thresholdSweep: ReturnType<typeof sweepConfidenceThresholds>;
  message: string;
};

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) {
    return channelData[0]!;
  }
  const length = channelData[0]!.length;
  const mono = new Float32Array(length);
  const n = channelData.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) {
      sum += channelData[c]![i] ?? 0;
    }
    mono[i] = sum / n;
  }
  return mono;
}

async function analyzeOne(meta: FixtureMeta): Promise<BenchmarkRow> {
  const bytes = new Uint8Array(fs.readFileSync(meta.absolutePath));
  const contentType =
    meta.format === "MP3" ? "audio/mpeg" : "audio/wav";

  const t0 = performance.now();

  if (!isDecodeSupported(contentType)) {
    return buildBenchmarkRow({
      meta,
      rawDetectedBpm: null,
      normalizedDetectedBpm: null,
      confidence: null,
      candidates: [],
      decodeMs: 0,
      detectionMs: 0,
      errorMessage: "Unsupported format for auto BPM decode",
    });
  }

  let samples: Float32Array;
  let sampleRate: number;
  try {
    const audio = await decode(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
    const channelData = audio.channelData as Float32Array[] | undefined;
    if (
      !channelData?.length ||
      !channelData[0]?.length ||
      typeof audio.sampleRate !== "number"
    ) {
      const t1 = performance.now();
      return buildBenchmarkRow({
        meta,
        rawDetectedBpm: null,
        normalizedDetectedBpm: null,
        confidence: null,
        candidates: [],
        decodeMs: Math.round(t1 - t0),
        detectionMs: 0,
        errorMessage: "Decode produced empty PCM",
      });
    }
    samples = mixToMono(channelData);
    sampleRate = audio.sampleRate;
  } catch (e) {
    const t1 = performance.now();
    return buildBenchmarkRow({
      meta,
      rawDetectedBpm: null,
      normalizedDetectedBpm: null,
      confidence: null,
      candidates: [],
      decodeMs: Math.round(t1 - t0),
      detectionMs: 0,
      errorMessage: e instanceof Error ? e.message : "decode failed",
    });
  }

  const t1 = performance.now();

  try {
    const raw = tempo(samples, {
      fs: sampleRate,
      candidates: 5,
      minBpm: 60,
      maxBpm: 200,
    }) as {
      bpm?: number;
      confidence?: number;
      candidates?: Array<{ bpm: number; confidence: number }>;
    };
    const t2 = performance.now();

    const list =
      Array.isArray(raw.candidates) && raw.candidates.length > 0
        ? raw.candidates.map((c) => ({
            bpm: c.bpm,
            confidence: c.confidence,
          }))
        : typeof raw.bpm === "number"
          ? [
              {
                bpm: raw.bpm,
                confidence:
                  typeof raw.confidence === "number" ? raw.confidence : 0,
              },
            ]
          : [];

    const rawTop = list.length > 0 ? roundBpm(list[0]!.bpm) : null;
    const ranked = rankBpmCandidates(list);

    return buildBenchmarkRow({
      meta,
      rawDetectedBpm: rawTop,
      normalizedDetectedBpm: ranked?.bpm ?? null,
      confidence: ranked?.confidence ?? null,
      candidates: (ranked?.candidates ?? list).map((c) => ({
        bpm: roundBpm(c.bpm) ?? Math.round(c.bpm),
        confidence: c.confidence,
      })),
      decodeMs: Math.round(t1 - t0),
      detectionMs: Math.round(t2 - t1),
    });
  } catch (e) {
    const t2 = performance.now();
    return buildBenchmarkRow({
      meta,
      rawDetectedBpm: null,
      normalizedDetectedBpm: null,
      confidence: null,
      candidates: [],
      decodeMs: Math.round(t1 - t0),
      detectionMs: Math.round(t2 - t1),
      errorMessage: e instanceof Error ? e.message : "tempo failed",
    });
  }
}

export async function runBpmBenchmark(params?: {
  fixturesDir?: string;
}): Promise<BenchmarkRunResult> {
  const fixturesDir = params?.fixturesDir ?? DEFAULT_BPM_FIXTURES_DIR;
  const fixtures = discoverBpmFixtures(fixturesDir);

  if (fixtures.length === 0) {
    return {
      status: "BLOCKED",
      fixturesDir,
      fixtureCount: 0,
      rows: [],
      byLayer: summarizeByLayer([]),
      byGenre: summarizeByGenre([]),
      confidence045: confidenceBuckets([]),
      thresholdSweep: sweepConfidenceThresholds([]),
      message:
        "BENCHMARK BLOCKED — no known-BPM fixtures matching naming conventions in fixtures dir.",
    };
  }

  const rows: BenchmarkRow[] = [];
  for (const meta of fixtures) {
    rows.push(await analyzeOne(meta));
  }

  return {
    status: "RAN",
    fixturesDir,
    fixtureCount: fixtures.length,
    rows,
    byLayer: summarizeByLayer(rows),
    byGenre: summarizeByGenre(rows),
    confidence045: confidenceBuckets(rows, 0.45),
    thresholdSweep: sweepConfidenceThresholds(rows),
    message: `Benchmark ran on ${fixtures.length} fixture(s). Accuracy not auto-certified — Owner review required.`,
  };
}
