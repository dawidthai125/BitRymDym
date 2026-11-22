/**
 * Studio Mastering poller (E3 Contabo host).
 *   npm run master:worker:poll
 * Env: STUDIO_MASTER_ENABLED=true (kill switch; otherwise exit 0), SUPABASE service
 *   role env (same as E3 worker), STUDIO_MASTER_WORKER_REF, STUDIO_MASTER_POLL_MS,
 *   STUDIO_MASTER_PYTHON (venv python), STUDIO_MASTER_SCRIPT, STUDIO_MASTER_TIMEOUT_MS, FFMPEG_BIN.
 * Logs never include secrets or signed URLs.
 */
import { sweepExpiredStudioReferences } from "../src/lib/studio/master/reference-store";
import { claimNextStudioMasterJob, claimNextWorkClip, runStudioMasterJob, runWorkClipJob, WorkClipQueueUnavailable } from "../src/lib/studio/master/worker";

/** Reference tracks older than 24 h (unused / abandoned uploads) are deleted from the idle loop. */
const REFERENCE_SWEEP_MS = 10 * 60_000;
/** Public 45 s work clips (catalog publish) are cut when no master job waits; checked at most every 15 s. */
const WORK_CLIP_POLL_MS = 15_000;
/** Clip RPC not deployed yet (migration 20261122140000) → ask again only every 10 min. */
const WORK_CLIP_MISSING_BACKOFF_MS = 10 * 60_000;
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
  let lastSweep = 0;
  let nextClipAt = 0;
  while (!stop) {
    if (Date.now() - lastSweep > REFERENCE_SWEEP_MS) {
      lastSweep = Date.now();
      try {
        const n = await sweepExpiredStudioReferences();
        if (n) console.log(JSON.stringify({ event: "studio_reference_sweep", deleted: n }));
      } catch (e) {
        console.log(JSON.stringify({ event: "studio_reference_sweep_error", message: e instanceof Error ? e.message.slice(0, 80) : "unknown" }));
      }
    }
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
    if (Date.now() >= nextClipAt) {
      nextClipAt = Date.now() + WORK_CLIP_POLL_MS;
      try {
        const clip = await claimNextWorkClip(cfg);
        if (clip) {
          const t0 = Date.now();
          const status = await runWorkClipJob(cfg, clip);
          console.log(JSON.stringify({ event: "work_clip_done", workId: clip.id, status, ms: Date.now() - t0 }));
          nextClipAt = 0;
          continue;
        }
      } catch (e) {
        if (e instanceof WorkClipQueueUnavailable) nextClipAt = Date.now() + WORK_CLIP_MISSING_BACKOFF_MS;
        else console.log(JSON.stringify({ event: "work_clip_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
      }
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "studio_master_stopped" }));
}

void main();
