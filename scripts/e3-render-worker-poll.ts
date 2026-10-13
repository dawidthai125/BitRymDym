/**
 * Contabo Continuous Worker V1 — STUDIO_EXPORT poller entry (GO-IMPL-CONTABO-POLL).
 *
 * Usage (local / non-Production gated only) — F-W2-02 CLI bootstrap stub required:
 *   npm run e3:worker:poll
 *
 * Env (when actually claiming):
 *   E3_RENDER_JOBS_ENABLED=true
 *   E3_RENDER_WORKER_SECRET=...
 *   E3_WORKER_REF=<unique instance id>
 *   E3_POLLER_POLL_MS=2000 (optional)
 *
 * Kill switch (GO-POLLER-KILL-SWITCH-01):
 *   false / 0 / no / off / missing / empty / invalid → log poller_disabled, exit 0.
 *   No claim RPC, no bake, no status mutation. No crash loop with Restart=no.
 *   Changing worker.env / unit Environment= requires process stop/restart
 *   (no hot-reload of the flag).
 *
 * Does NOT enable Contabo systemd, apply prod migrations, or auto-retry FAILED jobs.
 * Logs never include secrets, tokens, cookies, or signed URLs.
 */

import { decideStudioExportPollerBootstrap } from "../src/lib/audio/studio-export-poller-bootstrap";
import { createStudioExportPoller } from "../src/lib/audio/studio-export-poller";
import {
  formatSafePollerLog,
  redactUnsafeLogText,
} from "../src/lib/audio/studio-export-poller-log";

async function main() {
  const decision = decideStudioExportPollerBootstrap({
    renderJobsEnabledRaw: process.env.E3_RENDER_JOBS_ENABLED,
    workerRefRaw: process.env.E3_WORKER_REF,
    pollMsRaw: process.env.E3_POLLER_POLL_MS,
    pid: process.pid,
  });

  if (decision.action === "exit_disabled") {
    // eslint-disable-next-line no-console -- worker process
    console.log(
      formatSafePollerLog({
        event: decision.event,
        errorCode: decision.errorCode,
        workerRef: decision.workerRef,
      }),
    );
    process.exit(decision.exitCode);
  }

  const poller = createStudioExportPoller({
    workerRef: decision.workerRef,
    pollMs: decision.pollMs,
  });

  const onSignal = (signal: string) => {
    // eslint-disable-next-line no-console -- worker process
    console.log(
      JSON.stringify({
        event: "signal",
        signal,
        workerRef: poller.workerRef,
      }),
    );
    poller.requestStop();
  };

  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  // eslint-disable-next-line no-console -- worker process
  console.log(
    JSON.stringify({
      event: "poller_start",
      workerRef: poller.workerRef,
      pollMs: poller.pollMs,
      kindAllowlist: ["STUDIO_EXPORT"],
    }),
  );

  const code = await poller.runUntilStopped();
  process.exit(code);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console -- worker process
  console.error(redactUnsafeLogText(message));
  process.exit(1);
});
