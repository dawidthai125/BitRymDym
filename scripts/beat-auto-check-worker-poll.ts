/**
 * Upload filter — beat_auto_check poller (E3 Contabo host).
 *   npm run autocheck:worker:poll
 * Env: BEAT_AUTO_CHECK_ENABLED=true (kill switch; otherwise exit 0),
 *   SUPABASE service role env (same as E3 worker), BEAT_AUTO_CHECK_WORKER_REF,
 *   BEAT_AUTO_CHECK_POLL_MS, ACOUSTID_CLIENT_KEY (optional), BEAT_AUTO_CHECK_PYTHON,
 *   BEAT_AUTO_CHECK_VOCAL_SCRIPT, FPCALC_BIN.
 * Logs never include secrets or fingerprints.
 */
import { decideAutoCheckWorkerConfig } from "../src/lib/beats/auto-check/worker-env";
import { claimNextAutoCheck, runAutoCheck } from "../src/lib/beats/auto-check/worker";

async function main() {
  const cfg = decideAutoCheckWorkerConfig(process.env, process.pid);
  if (cfg.action === "exit_disabled") {
    console.log(JSON.stringify({ event: "autocheck_disabled", reason: cfg.reason }));
    return;
  }
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "autocheck_started", workerRef: cfg.workerRef, acoustid: cfg.acoustidKey ? "configured" : "not_configured" }));
  while (!stop) {
    try {
      const check = await claimNextAutoCheck(cfg);
      if (check) {
        const t0 = Date.now();
        const status = await runAutoCheck(cfg, check);
        console.log(JSON.stringify({ event: "autocheck_done", checkId: check.id, status, ms: Date.now() - t0 }));
        continue;
      }
    } catch (e) {
      console.log(JSON.stringify({ event: "autocheck_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "autocheck_stopped" }));
}

void main();
