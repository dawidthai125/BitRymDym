import fs from "node:fs";
import path from "node:path";

type Row = {
  expectedBpm: number;
  rawDetectedBpm: number | null;
  normalizedDetectedBpm: number | null;
  absoluteError: number | null;
  confidence: number | null;
  classification: string;
  decodeMs: number;
  detectionMs: number;
  totalMs: number;
  candidates?: Array<{ bpm: number; confidence: number }>;
};

type Bench = {
  status: string;
  fixtureCount: number;
  rows: Row[];
  confidence045?: Record<string, number>;
  thresholdSweep?: Record<string, unknown>;
};

function avg(a: number[]): number {
  return a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length;
}

function main() {
  const inPath =
    process.env.BPM_BENCH_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-bench.json");
  const j = JSON.parse(fs.readFileSync(inPath, "utf8")) as Bench;
  const rows = j.rows;
  const n = rows.length;

  const cls: Record<string, number> = {};
  for (const r of rows) {
    cls[r.classification] = (cls[r.classification] || 0) + 1;
  }

  const exact = rows.filter((r) => r.classification === "EXACT").length;
  const w1 = rows.filter((r) =>
    ["EXACT", "WITHIN_1"].includes(r.classification),
  ).length;
  const w2 = rows.filter((r) =>
    ["EXACT", "WITHIN_1", "WITHIN_2"].includes(r.classification),
  ).length;

  const abs = rows
    .map((r) => r.absoluteError)
    .filter((x): x is number => x != null);
  const conf = rows
    .map((r) => r.confidence)
    .filter((x): x is number => x != null);
  const times = rows.map((r) => r.totalMs);
  const decode = rows.map((r) => r.decodeMs);
  const det = rows.map((r) => r.detectionMs);

  const rap = [
    87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 103, 105,
  ];
  const hd = [70, 72, 75, 80, 85, 90, 140, 144, 150, 160, 170, 180];

  const out = {
    status: j.status,
    n,
    cls,
    exactRate: +(exact / n).toFixed(4),
    within1: +(w1 / n).toFixed(4),
    within2: +(w2 / n).toFixed(4),
    halfDouble: rows
      .filter((r) => ["HALF", "DOUBLE"].includes(r.classification))
      .map((r) => ({
        e: r.expectedBpm,
        n: r.normalizedDetectedBpm,
        raw: r.rawDetectedBpm,
        cls: r.classification,
        c: +(Number(r.confidence) || 0).toFixed(3),
      })),
    miss: rows
      .filter((r) => r.classification === "MISS")
      .map((r) => ({
        e: r.expectedBpm,
        n: r.normalizedDetectedBpm,
        raw: r.rawDetectedBpm,
        c: +(Number(r.confidence) || 0).toFixed(3),
      })),
    avgAbs: +avg(abs).toFixed(3),
    maxAbs: abs.length ? Math.max(...abs) : null,
    avgConf: +avg(conf).toFixed(3),
    perf: {
      avgDecode: +avg(decode).toFixed(1),
      avgDet: +avg(det).toFixed(1),
      avgTotal: +avg(times).toFixed(1),
      maxTotal: times.length ? Math.max(...times) : null,
    },
    buckets: j.confidence045,
    sweep: j.thresholdSweep,
    rapZone: rows
      .filter((r) => rap.includes(r.expectedBpm))
      .map((r) => ({
        e: r.expectedBpm,
        raw: r.rawDetectedBpm,
        norm: r.normalizedDetectedBpm,
        err: r.absoluteError,
        c: +(Number(r.confidence) || 0).toFixed(3),
        cls: r.classification,
        top: (r.candidates || [])
          .slice(0, 3)
          .map(
            (c) => `${c.bpm}@${Number(c.confidence).toFixed(2)}`,
          ),
      })),
    hdFocus: rows
      .filter((r) => hd.includes(r.expectedBpm))
      .map((r) => ({
        e: r.expectedBpm,
        raw: r.rawDetectedBpm,
        norm: r.normalizedDetectedBpm,
        cls: r.classification,
        c: +(Number(r.confidence) || 0).toFixed(3),
      })),
    table: rows.map((r) => ({
      e: r.expectedBpm,
      raw: r.rawDetectedBpm,
      norm: r.normalizedDetectedBpm,
      err: r.absoluteError,
      rel:
        r.absoluteError != null && r.expectedBpm
          ? +(r.absoluteError / r.expectedBpm).toFixed(4)
          : null,
      c: +(Number(r.confidence) || 0).toFixed(3),
      cls: r.classification,
      top: (r.candidates || [])
        .slice(0, 3)
        .map((c) => `${c.bpm}@${Number(c.confidence).toFixed(2)}`),
      dec: r.decodeMs,
      det: r.detectionMs,
      tot: r.totalMs,
    })),
  };

  const outPath = path.join(
    process.env.TEMP ?? "/tmp",
    "bpm-bench-summary.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify({ summaryPath: outPath, ...out }, null, 2));
}

main();
