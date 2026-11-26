/**
 * Upload filter — beat_auto_check poller (E3 Contabo host).
 *   npm run autocheck:worker:poll
 * Env: BEAT_AUTO_CHECK_ENABLED=true (kill switch; otherwise exit 0),
 *   SUPABASE service role env (same as E3 worker), BEAT_AUTO_CHECK_WORKER_REF,
 *   BEAT_AUTO_CHECK_POLL_MS, ACOUSTID_CLIENT_KEY (optional), BEAT_AUTO_CHECK_PYTHON,
 *   BEAT_AUTO_CHECK_VOCAL_SCRIPT, FPCALC_BIN,
 *   BEAT_PREVIEW_ENABLED=true (render guest 20 s preview after each check),
 *   BEAT_PREVIEW_SWEEP_MS (>=10000: when idle, fill one missing/stale preview).
 *   Admin OPS MP3 (tag ops-mp3-wanted) is always swept when idle — Contabo ffmpeg.
 *   Rights (owner decision 2026-11-26): catalogue work checks are claimed after beat checks;
 *   when idle, one missing beat fingerprint (APPROVED/PUBLISHED) and one missing sample
 *   fingerprint (catalogue + waiting for review) are filled per loop.
 * Logs never include secrets or fingerprints.
 */
import { decideAutoCheckWorkerConfig } from "../src/lib/beats/auto-check/worker-env";
import { claimNextAutoCheck, runAutoCheck } from "../src/lib/beats/auto-check/worker";
import {
  ensureOpsMp3Asset,
  listBeatsNeedingOpsMp3,
} from "../src/lib/beats/ops-mp3/ops-mp3-service";
import {
  ensureBeatPreviewAsset,
  listBeatsNeedingPreview,
} from "../src/lib/beats/preview/beat-preview-service";
import {
  claimNextWorkCheck,
  fingerprintBeat,
  fingerprintSample,
  nextBeatNeedingFingerprint,
  nextSampleNeedingFingerprint,
  runWorkCheck,
} from "../src/lib/rights/rights-worker";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

/** Files that failed in this process are not retried until the poller restarts. */
const failedBeatAssets = new Set<string>();
const failedSampleKeys = new Set<string>();
/** Nothing to fingerprint (or a listing error): look again after a minute (not urgent). */
let fingerprintIdleUntil = 0;

/** A catalogue work waiting for the rights check: run it. True when one was handled. */
async function workCheckStep(cfg: Parameters<typeof runWorkCheck>[0]): Promise<boolean> {
  const work = await claimNextWorkCheck(cfg);
  if (!work) return false;
  const t0 = Date.now();
  const status = await runWorkCheck(cfg, work);
  console.log(JSON.stringify({ event: "work_check_done", workId: work.id, status, ms: Date.now() - t0 }));
  return true;
}

/** At most one missing fingerprint per loop (beats first, then samples). Never blocks the other idle jobs. */
async function fingerprintStep(cfg: Parameters<typeof runWorkCheck>[0]): Promise<void> {
  if (Date.now() < fingerprintIdleUntil) return;
  try {
    const admin = createSupabaseAdminClient();
    const beat = await nextBeatNeedingFingerprint(admin, failedBeatAssets);
    if (beat) {
      try {
        await fingerprintBeat(cfg, beat);
        console.log(JSON.stringify({ event: "beat_fingerprint_done", beatId: beat.beatId }));
      } catch (e) {
        failedBeatAssets.add(beat.assetId);
        console.log(JSON.stringify({ event: "beat_fingerprint_error", beatId: beat.beatId, message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
      }
      return;
    }
    const sample = await nextSampleNeedingFingerprint(admin, failedSampleKeys);
    if (sample) {
      try {
        await fingerprintSample(cfg, sample);
        console.log(JSON.stringify({ event: "sample_fingerprint_done", sampleId: sample.sampleId, review: sample.review }));
      } catch (e) {
        failedSampleKeys.add(sample.key);
        console.log(JSON.stringify({ event: "sample_fingerprint_error", sampleId: sample.sampleId, message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
      }
      return;
    }
    fingerprintIdleUntil = Date.now() + 60_000;
  } catch (e) {
    fingerprintIdleUntil = Date.now() + 60_000;
    console.log(JSON.stringify({ event: "fingerprint_list_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
  }
}

async function preview(beatId: string) {
  // Best effort: a preview failure never changes the auto-check verdict.
  try {
    const r = await ensureBeatPreviewAsset({ admin: createSupabaseAdminClient() }, { beatId });
    console.log(JSON.stringify({ event: "preview_done", beatId, outcome: r.outcome, errorCode: r.errorCode ?? null }));
  } catch (e) {
    console.log(JSON.stringify({ event: "preview_error", beatId, message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
  }
}

async function opsMp3(beatId: string) {
  try {
    const r = await ensureOpsMp3Asset({ admin: createSupabaseAdminClient() }, { beatId });
    console.log(JSON.stringify({ event: "ops_mp3_done", beatId, outcome: r.outcome, errorCode: r.errorCode ?? null }));
  } catch (e) {
    console.log(JSON.stringify({ event: "ops_mp3_error", beatId, message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
  }
}

async function main() {
  const cfg = decideAutoCheckWorkerConfig(process.env, process.pid);
  if (cfg.action === "exit_disabled") {
    console.log(JSON.stringify({ event: "autocheck_disabled", reason: cfg.reason }));
    return;
  }
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "autocheck_started", workerRef: cfg.workerRef, acoustid: cfg.acoustidKey ? "configured" : "not_configured", preview: cfg.previewEnabled, previewSweepMs: cfg.previewSweepMs }));
  let lastSweep = 0;
  while (!stop) {
    try {
      const check = await claimNextAutoCheck(cfg);
      if (check) {
        const t0 = Date.now();
        const status = await runAutoCheck(cfg, check);
        console.log(JSON.stringify({ event: "autocheck_done", checkId: check.id, status, ms: Date.now() - t0 }));
        if (cfg.previewEnabled) await preview(check.beat_id);
        continue;
      }
      if (await workCheckStep(cfg)) continue;
      {
        const [opsId] = await listBeatsNeedingOpsMp3(createSupabaseAdminClient(), { limit: 1 });
        if (opsId) {
          await opsMp3(opsId);
          continue;
        }
      }
      await fingerprintStep(cfg);
      if (cfg.previewSweepMs > 0 && Date.now() - lastSweep >= cfg.previewSweepMs) {
        lastSweep = Date.now();
        const [beatId] = await listBeatsNeedingPreview(createSupabaseAdminClient(), { limit: 1 });
        if (beatId) await preview(beatId);
      }
    } catch (e) {
      console.log(JSON.stringify({ event: "autocheck_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  console.log(JSON.stringify({ event: "autocheck_stopped" }));
}

void main();
