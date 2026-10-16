/**
 * SFM dedicated worker poller (GO-SFM-WORKER-ENTRY).
 *
 * Usage (local / staging after separate ops GO — never auto-start in prod):
 *   npm run sfm:worker:poll
 *
 * Env (when actually claiming):
 *   SFM_WORKER_ENABLED=true          — process kill switch (default OFF)
 *   SFM_VERSIONS_V1=true             — product gate (default OFF)
 *   E3_RENDER_JOBS_ENABLED=true      — required by claimNextSfmJobAsWorker runtime
 *   E3_WORKER_REF / SFM_WORKER_REF   — unique instance id (optional; defaults to sfm-poller:<pid>)
 *   SFM_WORKER_POLL_MS=2000          — optional (200..60000)
 *   + service_role / admin client env as for other workers
 *
 * Kill switch:
 *   SFM_WORKER_ENABLED false/missing/invalid → log poller_disabled, exit 0 (no claim).
 *   SFM_VERSIONS_V1 OFF → log poller_disabled, exit 0 (no claim).
 *   Changing env requires process stop/restart (no hot-reload).
 *
 * Claims ONLY via claim_next_sfm_job (SFM_MIX_PREPARE / SFM_MASTER_BAKE /
 * SFM_QUALITY_ENCODE). Does NOT use claim_next_studio_export_job.
 * Does NOT enable Contabo systemd, apply migrations, or auto-retry FAILED jobs.
 * Logs never include secrets, tokens, cookies, or signed URLs.
 */

import { decideSfmWorkerPollerBootstrap } from "../src/lib/sfm/sfm-worker-poller-bootstrap";
import { createSfmWorkerPoller } from "../src/lib/sfm/sfm-worker-poller";
import {
  formatSafePollerLog,
  redactUnsafeLogText,
} from "../src/lib/audio/studio-export-poller-log";

async function main() {
  const decision = decideSfmWorkerPollerBootstrap({
    sfmWorkerEnabledRaw: process.env.SFM_WORKER_ENABLED,
    sfmVersionsV1Raw: process.env.SFM_VERSIONS_V1,
    workerRefRaw: process.env.SFM_WORKER_REF ?? process.env.E3_WORKER_REF,
    pollMsRaw: process.env.SFM_WORKER_POLL_MS,
    pid: process.pid,
  });

  if (decision.action === "exit_disabled") {
    console.log(
      formatSafePollerLog({
        event: decision.event,
        errorCode: decision.errorCode,
        workerRef: decision.workerRef,
      }),
    );
    process.exit(decision.exitCode);
  }

  const poller = createSfmWorkerPoller({
    workerRef: decision.workerRef,
    pollMs: decision.pollMs,
  });

  const onSignal = (signal: string) => {
    console.log(
      formatSafePollerLog({
        event: "signal",
        errorCode: signal,
        workerRef: poller.workerRef,
      }),
    );
    poller.requestStop();
  };

  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  console.log(
    formatSafePollerLog({
      event: "poller_start",
      workerRef: poller.workerRef,
      kind: "SFM_EXECUTOR",
    }),
  );

  console.log(
    JSON.stringify({
      event: "poller_config",
      workerRef: poller.workerRef,
      pollMs: poller.pollMs,
      kindAllowlist: [
        "SFM_MIX_PREPARE",
        "SFM_MASTER_BAKE",
        "SFM_QUALITY_ENCODE",
      ],
    }),
  );

  const code = await poller.runUntilStopped();
  process.exit(code);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(redactUnsafeLogText(message));
  process.exit(1);
});
