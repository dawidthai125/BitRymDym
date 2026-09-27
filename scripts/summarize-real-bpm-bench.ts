import fs from "node:fs";
import path from "node:path";

type Row = {
  file: string;
  layer: string;
  genre: string;
  format: string;
  expectedBpm: number;
  rawDetectedBpm: number | null;
  normalizedDetectedBpm: number | null;
  absoluteError: number | null;
  relativeError: number | null;
  confidence: number | null;
  classification: string;
  decodeMs: number;
  detectionMs: number;
  totalMs: number;
  candidates?: Array<{ bpm: number; confidence: number }>;
  errorMessage?: string | null;
};

function avg(a: number[]): number {
  return a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length;
}

function rates(rows: Row[]) {
  const n = rows.length;
  const exact = rows.filter((r) => r.classification === "EXACT").length;
  const w1 = rows.filter((r) =>
    ["EXACT", "WITHIN_1"].includes(r.classification),
  ).length;
  const w2 = rows.filter((r) =>
    ["EXACT", "WITHIN_1", "WITHIN_2"].includes(r.classification),
  ).length;
  const cls: Record<string, number> = {};
  for (const r of rows) cls[r.classification] = (cls[r.classification] || 0) + 1;
  return {
    n,
    cls,
    exactRate: n ? +(exact / n).toFixed(4) : 0,
    within1: n ? +(w1 / n).toFixed(4) : 0,
    within2: n ? +(w2 / n).toFixed(4) : 0,
  };
}

function mapRow(r: Row) {
  return {
    file: r.file,
    layer: r.layer,
    e: r.expectedBpm,
    raw: r.rawDetectedBpm,
    norm: r.normalizedDetectedBpm,
    abs: r.absoluteError,
    rel: r.relativeError,
    c: r.confidence == null ? null : +Number(r.confidence).toFixed(3),
    cls: r.classification,
    top: (r.candidates || [])
      .slice(0, 4)
      .map((c) => `${c.bpm}@${Number(c.confidence).toFixed(2)}`),
    dec: r.decodeMs,
    det: r.detectionMs,
    tot: r.totalMs,
    rawVsNorm:
      r.rawDetectedBpm !== r.normalizedDetectedBpm
        ? `${r.rawDetectedBpm}→${r.normalizedDetectedBpm}`
        : "same",
    err: r.errorMessage ?? null,
  };
}

function main() {
  const inPath =
    process.env.BPM_BENCH_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-bench.json");
  const j = JSON.parse(fs.readFileSync(inPath, "utf8")) as {
    status: string;
    fixtureCount: number;
    rows: Row[];
    confidence045?: Record<string, number>;
    byLayer?: unknown;
  };

  const real = j.rows.filter((r) =>
    ["RAP_BOOMBAP", "RAP_TRAP", "RAP_DRILL"].includes(r.layer),
  );
  const synth = j.rows.filter((r) => r.layer === "SYNTHETIC");
  const zoneA = real.filter(
    (r) => r.expectedBpm >= 87 && r.expectedBpm <= 105,
  );
  const zoneB = real.filter(
    (r) => r.expectedBpm >= 130 && r.expectedBpm <= 150,
  );

  const scored = real.filter(
    (r) =>
      r.classification !== "ERROR" &&
      r.classification !== "SKIPPED" &&
      typeof r.confidence === "number",
  );
  let correctGe = 0;
  let incorrectGe = 0;
  let correctLt = 0;
  let incorrectLt = 0;
  for (const r of scored) {
    const correct = ["EXACT", "WITHIN_1", "WITHIN_2"].includes(
      r.classification,
    );
    const ge = (r.confidence ?? 0) >= 0.45;
    if (correct && ge) correctGe++;
    else if (correct && !ge) correctLt++;
    else if (!correct && ge) incorrectGe++;
    else incorrectLt++;
  }

  const highConfWrong = scored.filter(
    (r) =>
      (r.confidence ?? 0) >= 0.45 &&
      !["EXACT", "WITHIN_1", "WITHIN_2"].includes(r.classification),
  );

  const rawVsNormDiff = real.filter(
    (r) =>
      r.rawDetectedBpm != null &&
      r.normalizedDetectedBpm != null &&
      r.rawDetectedBpm !== r.normalizedDetectedBpm,
  );

  const out = {
    status: j.status,
    totalFixtures: j.fixtureCount,
    syntheticCount: synth.length,
    realCount: real.length,
    realRates: rates(real),
    zone87_105: { ...rates(zoneA), rows: zoneA.map(mapRow) },
    zone130_150: { ...rates(zoneB), rows: zoneB.map(mapRow) },
    confidence045: {
      correctGe045: correctGe,
      correctLt045: correctLt,
      incorrectGe045: incorrectGe,
      incorrectLt045: incorrectLt,
    },
    highConfidenceWrong: highConfWrong.map(mapRow),
    rawVsNormalizedDiffs: rawVsNormDiff.map(mapRow),
    halfDouble: real
      .filter((r) => ["HALF", "DOUBLE"].includes(r.classification))
      .map(mapRow),
    miss: real.filter((r) => r.classification === "MISS").map(mapRow),
    perf: {
      avgDecode: +avg(real.map((r) => r.decodeMs)).toFixed(1),
      avgDet: +avg(real.map((r) => r.detectionMs)).toFixed(1),
      avgTotal: +avg(real.map((r) => r.totalMs)).toFixed(1),
      maxTotal: Math.max(...real.map((r) => r.totalMs)),
    },
    table: real.map(mapRow),
    byLayer: {
      RAP_BOOMBAP: rates(real.filter((r) => r.layer === "RAP_BOOMBAP")),
      RAP_TRAP: rates(real.filter((r) => r.layer === "RAP_TRAP")),
      RAP_DRILL: rates(real.filter((r) => r.layer === "RAP_DRILL")),
    },
  };

  const outPath = path.join(
    process.env.TEMP ?? "/tmp",
    "bpm-bench-real-summary.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
}

main();
