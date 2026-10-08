/**
 * E3.6 / E3.7 EXTERNAL worker entry (OD-E36-04 = C).
 *
 * Usage (local/non-Production gated E2E only) — F-W2-02 CLI bootstrap stub required:
 *   npx tsx --import ./scripts/register-server-only-stub.mjs scripts/e3-render-worker-once.ts <jobId>
 *   # or: npm run e3:worker:once -- <jobId>
 *
 * With env when actually claiming (not required for server-only bootstrap check):
 *   E3_RENDER_JOBS_ENABLED=true E3_RENDER_WORKER_SECRET=...
 *
 * Supports MIX BASIC_MP3 / HQ_MP3 / WAV and P4.6 TAKE_EXPORT (incl. MP3_192)
 * via runRealRenderWorkerJob.
 * Do NOT set Production flags / secrets for this script.
 * Do NOT strip `import "server-only"` from pipeline modules — use the CLI stub instead.
 */

import { runRealRenderWorkerJob } from "../src/lib/audio/render-worker-pipeline";

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error(
      "Usage: npx tsx --import ./scripts/register-server-only-stub.mjs scripts/e3-render-worker-once.ts <jobId>",
    );
    process.exit(2);
  }
  const result = await runRealRenderWorkerJob(jobId);
  console.log(
    JSON.stringify(
      {
        success: true,
        jobId: result.job.id,
        status: result.job.status,
        qualityTier: result.qualityTier,
        artifactId: result.artifactId,
        objectKey: result.objectKey,
        byteSize: result.byteSize,
        bitrateKbps: result.bitrateKbps,
        durationMs: result.durationMs,
        encoder: result.encoder,
        contentType: result.contentType,
        checksum: result.checksumSha256,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
