import fs from "node:fs";
import path from "node:path";
import { runBpmBenchmark } from "../src/lib/beats/bpm-benchmark/run";

async function main() {
  const out =
    process.env.BPM_BENCH_OUT ??
    path.join(process.env.TEMP ?? "/tmp", "bpm-bench.json");

  const result = await runBpmBenchmark();
  fs.writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
  console.log(
    JSON.stringify({
      status: result.status,
      fixtureCount: result.fixtureCount,
      out,
    }),
  );
  if (result.status === "BLOCKED") process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
