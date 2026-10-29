/**
 * Studio Mastering poller (E3 Contabo host).
 *   npm run master:worker:poll
 * Env: STUDIO_MASTER_ENABLED=true (kill switch; otherwise exit 0), SUPABASE service
 *   role env (same as E3 worker), STUDIO_MASTER_WORKER_REF, STUDIO_MASTER_POLL_MS,
 *   STUDIO_MASTER_PYTHON (venv python), STUDIO_MASTER_SCRIPT, STUDIO_MASTER_TIMEOUT_MS, FFMPEG_BIN.
 * Logs never include secrets or signed URLs.
 */
import { claimNextStudioMasterJob, runStudioMasterJob } from "../src/lib/studio/master/worker";
import { decideStudioMasterWorkerConfig } from "../src/lib/studio/master/worker-env";

async function main() {
  const cfg = decideStudioMasterWorkerConfig(process.env, process.pid);
  if (cfg.action === "exit_disabled") {
    console.log(JSON.stringify({ event: "studio_master_disabled", reason: cfg.reason }));
    return;
  }
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "studio_master_started", workerRef: cfg.workerRef }));
  while (!stop) {
    try {
      const job = await claimNextStudioMasterJob(cfg);
      if (job) {
        const t0 = Date.now();
        const status = await runStudioMasterJob(cfg, job);
        console.log(JSON.stringify({ event: "studio_master_done", jobId: job.id, kind: job.kind, status, ms: Date.now() - t0 }));
        continue;
      }
    } catch (e) {
      console.log(JSON.stringify({ event: "studio_master_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "studio_master_stopped" }));
}

void main();
