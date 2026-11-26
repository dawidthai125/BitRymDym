/**
 * Upload screen poller (E3 Contabo host). Owner order 2026-11-26.
 *   npm run upload-screen:worker:poll
 * Env: UPLOAD_SCREEN_ENABLED=true (kill switch; otherwise exit 0), SUPABASE service role env (same as the
 *   E3 worker), UPLOAD_SCREEN_WORKER_REF, UPLOAD_SCREEN_POLL_MS (default 2000), FPCALC_BIN.
 * Separate from the auto-check poller on purpose: a beat check (Demucs) takes minutes, a take screen a
 * second, and mastering of a new upload waits for its screen.
 * Order per loop: one pending upload screen first, then one missing fingerprint of a taken-down file.
 * Logs never include secrets or fingerprints.
 */
import {
  claimNextScreening,
  fillNextBlockedFingerprint,
  runScreening,
  uploadScreenConfig,
} from "../src/lib/rights/upload-screen-worker";

async function main() {
  const cfg = uploadScreenConfig(process.env, process.pid);
  if (!cfg) {
    console.log(JSON.stringify({ event: "upload_screen_disabled" }));
    return;
  }
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "upload_screen_started", workerRef: cfg.workerRef, pollMs: cfg.pollMs }));
  while (!stop) {
    try {
      const job = await claimNextScreening(cfg);
      if (job) {
        const t0 = Date.now();
        const status = await runScreening(cfg, job);
        console.log(JSON.stringify({ event: "upload_screen_done", takeId: job.take_id, status, ms: Date.now() - t0 }));
        continue;
      }
      const filled = await fillNextBlockedFingerprint(cfg);
      if (filled) {
        console.log(JSON.stringify({ event: "blocked_fingerprint_done", status: filled }));
        continue;
      }
    } catch (e) {
      console.log(JSON.stringify({ event: "upload_screen_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "upload_screen_stopped" }));
}

void main();
