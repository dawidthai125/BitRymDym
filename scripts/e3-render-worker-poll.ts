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
 * Does NOT enable Contabo systemd, apply prod migrations, or auto-retry FAILED jobs.
 * Logs never include secrets, tokens, cookies, or signed URLs.
 */

import { createStudioExportPoller } from "../src/lib/audio/studio-export-poller";
import { redactUnsafeLogText } from "../src/lib/audio/studio-export-poller-log";

function resolveWorkerRef(): string {
  const fromEnv = process.env.E3_WORKER_REF?.trim();
  if (fromEnv) return fromEnv;
  return `poller:${process.pid}`;
}

function resolvePollMs(): number {
  const raw = process.env.E3_POLLER_POLL_MS?.trim();
  if (!raw) return 2000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 200 || n > 60_000) {
    throw new Error("E3_POLLER_POLL_MS must be 200..60000");
  }
  return Math.floor(n);
}

async function main() {
  const poller = createStudioExportPoller({
    workerRef: resolveWorkerRef(),
    pollMs: resolvePollMs(),
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
