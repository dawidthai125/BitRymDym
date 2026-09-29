/**
 * E3.6 / E3.7 EXTERNAL worker entry (OD-E36-04 = C).
 *
 * Usage (local/non-Production gated E2E only):
 *   E3_RENDER_JOBS_ENABLED=true E3_RENDER_WORKER_SECRET=... npx tsx scripts/e3-render-worker-once.ts <jobId>
 *
 * Supports BASIC_MP3 / HQ_MP3 / WAV via runRealRenderWorkerJob.
 * Do NOT set Production flags / secrets for this script.
 */

import { runRealRenderWorkerJob } from "../src/lib/audio/render-worker-pipeline";

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: tsx scripts/e3-render-worker-once.ts <jobId>");
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
