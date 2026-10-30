/**
 * Studio vocal cleanup poller (E3 Contabo host) — separate from the master poller.
 *   npm run cleanup:worker:poll
 * Env: STUDIO_CLEANUP_ENABLED=true (kill switch; otherwise exit 0), SUPABASE service role env
 *   (same as the E3 worker), STUDIO_CLEANUP_WORKER_REF, STUDIO_CLEANUP_POLL_MS,
 *   STUDIO_CLEANUP_TIMEOUT_MS, FFMPEG_BIN. Logs never include secrets or signed URLs.
 */
import { claimNextStudioCleanupJob, runStudioCleanupJob } from "../src/lib/studio/cleanup/cleanup-worker";
import { decideStudioCleanupWorkerConfig } from "../src/lib/studio/cleanup/cleanup-worker-env";

async function main() {
  const cfg = decideStudioCleanupWorkerConfig(process.env, process.pid);
  if (cfg.action === "exit_disabled") {
    console.log(JSON.stringify({ event: "studio_cleanup_disabled", reason: cfg.reason }));
    return;
  }
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "studio_cleanup_started", workerRef: cfg.workerRef }));
  while (!stop) {
    try {
      const job = await claimNextStudioCleanupJob(cfg);
      if (job) {
        const t0 = Date.now();
        const status = await runStudioCleanupJob(cfg, job);
        console.log(JSON.stringify({ event: "studio_cleanup_done", jobId: job.id, status, ms: Date.now() - t0 }));
        continue;
      }
    } catch (e) {
      console.log(JSON.stringify({ event: "studio_cleanup_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "studio_cleanup_stopped" }));
}

void main();
