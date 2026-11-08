/**
 * Stem separator poller (host with Demucs weights). Not started by Next.js.
 *   npm run separate:worker:poll
 * Env: SEPARATOR_ENABLED=true, DEMUCS_PYTHON (interpreter that has demucs),
 *   SUPABASE service role, optional SEPARATOR_WORKER_REF / POLL_MS / TIMEOUT_MS.
 * The script refuses to download weights (HF_HUB_OFFLINE=1).
 */
import { claimNextSeparateJob, runSeparateJob } from "../src/lib/studio/separate/separate-worker";
import { decideSeparatorWorker } from "../src/lib/studio/separate/separate-worker-env";

async function main() {
  const cfg = decideSeparatorWorker(process.env, process.pid);
  if (cfg.action === "exit_disabled") {
    console.log(JSON.stringify({ event: "studio_separate_disabled", reason: cfg.reason }));
    return;
  }
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "studio_separate_started", workerRef: cfg.workerRef }));
  while (!stop) {
    try {
      const job = await claimNextSeparateJob(cfg);
      if (job) {
        const started = Date.now();
        const status = await runSeparateJob(cfg, job);
        console.log(JSON.stringify({ event: "studio_separate_done", jobId: job.id, status, ms: Date.now() - started }));
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 120) : "unknown";
      console.log(JSON.stringify({ event: "studio_separate_loop_error", message }));
    }
    await new Promise((resolve) => setTimeout(resolve, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "studio_separate_stopped" }));
}

void main();
