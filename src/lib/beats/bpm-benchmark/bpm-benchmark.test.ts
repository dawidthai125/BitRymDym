import { describe, expect, it } from "vitest";

import {
  classifyBpmMatch,
  isCorrectClassification,
} from "@/lib/beats/bpm-benchmark/classify";
import { buildBenchmarkRow } from "@/lib/beats/bpm-benchmark/evaluate";
import {
  parseExpectedBpmFromFilename,
  parseFixtureFilename,
} from "@/lib/beats/bpm-benchmark/parse-fixture";
import {
  confidenceBuckets,
  summarizeByGenre,
  summarizeGroup,
  sweepConfidenceThresholds,
} from "@/lib/beats/bpm-benchmark/summary";
import type { BenchmarkRow, FixtureMeta } from "@/lib/beats/bpm-benchmark/types";

describe("parseFixtureFilename", () => {
  it("parses synthetic steady WAV/MP3", () => {
    expect(parseExpectedBpmFromFilename("bpm-87-steady.wav")).toBe(87);
    expect(parseFixtureFilename("bpm-140-steady.mp3")).toMatchObject({
      layer: "SYNTHETIC",
      genre: "synthetic",
      format: "MP3",
      expectedBpm: 140,
    });
  });

  it("parses rap boom bap / trap / drill", () => {
    expect(parseFixtureFilename("rap-boombap-92.wav")).toMatchObject({
      layer: "RAP_BOOMBAP",
      genre: "boombap",
      expectedBpm: 92,
      format: "WAV",
    });
    expect(parseFixtureFilename("rap-trap-150.wav")?.layer).toBe("RAP_TRAP");
    expect(parseFixtureFilename("rap-drill-142.wav")?.layer).toBe("RAP_DRILL");
  });

  it("parses optional source suffix after BPM", () => {
    expect(parseFixtureFilename("rap-boombap-90-fs680221.mp3")).toMatchObject({
      layer: "RAP_BOOMBAP",
      expectedBpm: 90,
      format: "MP3",
    });
    expect(parseFixtureFilename("rap-trap-140-fs456135.wav")).toMatchObject({
      layer: "RAP_TRAP",
      expectedBpm: 140,
      format: "WAV",
    });
    expect(parseExpectedBpmFromFilename("rap-drill-142-fs838789.wav")).toBe(
      142,
    );
  });

  it("rejects unknown names", () => {
    expect(parseFixtureFilename("phase19-master-tone.wav")).toBeNull();
    expect(parseFixtureFilename("bpm-140.wav")).toBeNull();
  });
});

describe("classifyBpmMatch", () => {
  it("EXACT only on equality", () => {
    expect(classifyBpmMatch({ expectedBpm: 140, detectedBpm: 140 })).toBe(
      "EXACT",
    );
    expect(classifyBpmMatch({ expectedBpm: 140, detectedBpm: 142 })).not.toBe(
      "EXACT",
    );
  });

  it("WITHIN_1 / WITHIN_2", () => {
    expect(classifyBpmMatch({ expectedBpm: 140, detectedBpm: 141 })).toBe(
      "WITHIN_1",
    );
    expect(classifyBpmMatch({ expectedBpm: 140, detectedBpm: 138 })).toBe(
      "WITHIN_2",
    );
  });

  it("HALF / DOUBLE", () => {
    expect(classifyBpmMatch({ expectedBpm: 140, detectedBpm: 70 })).toBe(
      "HALF",
    );
    expect(classifyBpmMatch({ expectedBpm: 70, detectedBpm: 140 })).toBe(
      "DOUBLE",
    );
    expect(classifyBpmMatch({ expectedBpm: 90, detectedBpm: 180 })).toBe(
      "DOUBLE",
    );
    expect(classifyBpmMatch({ expectedBpm: 180, detectedBpm: 90 })).toBe(
      "HALF",
    );
  });

  it("MISS", () => {
    expect(classifyBpmMatch({ expectedBpm: 140, detectedBpm: 128 })).toBe(
      "MISS",
    );
  });

  it("isCorrectClassification", () => {
    expect(isCorrectClassification("EXACT")).toBe(true);
    expect(isCorrectClassification("WITHIN_2")).toBe(true);
    expect(isCorrectClassification("HALF")).toBe(false);
    expect(isCorrectClassification("MISS")).toBe(false);
  });
});

describe("summarize + confidence", () => {
  const meta = (file: string, expectedBpm: number): FixtureMeta => ({
    file,
    absolutePath: file,
    layer: "SYNTHETIC",
    genre: "synthetic",
    format: "WAV",
    expectedBpm,
  });

  function row(
    expected: number,
    detected: number,
    confidence: number,
    file = `bpm-${expected}-steady.wav`,
  ): BenchmarkRow {
    return buildBenchmarkRow({
      meta: meta(file, expected),
      rawDetectedBpm: detected,
      normalizedDetectedBpm: detected,
      confidence,
      candidates: [{ bpm: detected, confidence }],
      decodeMs: 1,
      detectionMs: 2,
    });
  }

  it("computes group rates", () => {
    const rows = [
      row(140, 140, 0.9),
      row(90, 91, 0.8, "bpm-90-steady.wav"),
      row(70, 140, 0.95, "bpm-70-steady.wav"),
      row(120, 100, 0.2, "bpm-120-steady.wav"),
    ];
    const s = summarizeGroup("SYNTHETIC", rows);
    expect(s.fixtureCount).toBe(4);
    expect(s.exactHitRate).toBe(0.25);
    expect(s.within1HitRate).toBe(0.5);
    expect(s.halfDoubleCount).toBe(1);
    expect(s.missCount).toBe(1);
  });

  it("confidence buckets and threshold sweep", () => {
    const rows = [
      row(140, 140, 0.9),
      row(90, 90, 0.3, "bpm-90-steady.wav"),
      row(100, 128, 0.8, "bpm-100-steady.wav"),
      row(110, 100, 0.2, "bpm-110-steady.wav"),
    ];
    const b = confidenceBuckets(rows, 0.45);
    expect(b.correctGe045).toBe(1);
    expect(b.correctLt045).toBe(1);
    expect(b.incorrectGe045).toBe(1);
    expect(b.incorrectLt045).toBe(1);

    const sweep = sweepConfidenceThresholds(rows, [0.45, 0.5]);
    expect(sweep).toHaveLength(2);
    expect(sweep[0]!.threshold).toBe(0.45);
  });

  it("summarizeByGenre includes empty groups", () => {
    const g = summarizeByGenre([row(140, 140, 1)]);
    expect(g.find((x) => x.group === "SYNTHETIC")?.fixtureCount).toBe(1);
    expect(g.find((x) => x.group === "TRAP")?.fixtureCount).toBe(0);
  });
});
