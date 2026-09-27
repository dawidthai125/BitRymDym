/**
 * BPM benchmark harness types (accuracy certification gate).
 * Does not modify detector / threshold / DB.
 */

export type BenchmarkLayer =
  | "SYNTHETIC"
  | "RAP_BOOMBAP"
  | "RAP_TRAP"
  | "RAP_DRILL";

export type BenchmarkGenre =
  | "synthetic"
  | "boombap"
  | "trap"
  | "drill"
  | "unknown";

export type BenchmarkFormat = "WAV" | "MP3" | "OTHER";

export type BpmClassification =
  | "EXACT"
  | "WITHIN_1"
  | "WITHIN_2"
  | "HALF"
  | "DOUBLE"
  | "MISS";

export type FixtureMeta = {
  file: string;
  absolutePath: string;
  layer: BenchmarkLayer;
  genre: BenchmarkGenre;
  format: BenchmarkFormat;
  expectedBpm: number;
};

export type BpmCandidateSnapshot = {
  bpm: number;
  confidence: number;
};

export type BenchmarkRow = {
  file: string;
  layer: BenchmarkLayer;
  genre: BenchmarkGenre;
  format: BenchmarkFormat;
  expectedBpm: number;
  rawDetectedBpm: number | null;
  normalizedDetectedBpm: number | null;
  absoluteError: number | null;
  relativeError: number | null;
  confidence: number | null;
  candidates: BpmCandidateSnapshot[];
  decodeMs: number;
  detectionMs: number;
  totalMs: number;
  classification: BpmClassification | "SKIPPED" | "ERROR";
  errorMessage?: string;
};

export type GroupSummary = {
  group: string;
  fixtureCount: number;
  exactHitRate: number;
  within1HitRate: number;
  within2HitRate: number;
  halfDoubleCount: number;
  missCount: number;
  averageAbsoluteError: number | null;
  maxAbsoluteError: number | null;
  averageConfidence: number | null;
};

export type ConfidenceBucketCounts = {
  correctGe045: number;
  correctLt045: number;
  incorrectGe045: number;
  incorrectLt045: number;
};

export type ThresholdSweepRow = {
  threshold: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
};
