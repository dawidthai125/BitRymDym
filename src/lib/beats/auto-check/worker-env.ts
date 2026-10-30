/** Kill switch + env parsing for the beat_auto_check worker (pure). */
export type AutoCheckWorkerConfig =
  | { action: "exit_disabled"; reason: string }
  | {
      action: "run";
      workerRef: string;
      pollMs: number;
      acoustidKey: string | undefined;
      pythonBin: string;
      vocalScript: string;
      fpcalcBin: string;
      maxDurationSeconds: number;
      /** BEAT_PREVIEW_ENABLED: render the guest 20 s preview after each check. */
      previewEnabled: boolean;
      /** BEAT_PREVIEW_SWEEP_MS: when idle, fill one missing/stale preview at most this often (0 = off). */
      previewSweepMs: number;
    };

const TRUE = new Set(["true", "1", "yes", "on"]);

export function decideAutoCheckWorkerConfig(env: Record<string, string | undefined>, pid: number): AutoCheckWorkerConfig {
  if (!TRUE.has((env.BEAT_AUTO_CHECK_ENABLED ?? "").trim().toLowerCase())) {
    return { action: "exit_disabled", reason: "BEAT_AUTO_CHECK_ENABLED not true" };
  }
  const pollRaw = Number(env.BEAT_AUTO_CHECK_POLL_MS ?? "5000");
  const maxRaw = Number(env.BEAT_AUTO_CHECK_MAX_SECONDS ?? "900");
  const previewEnabled = TRUE.has((env.BEAT_PREVIEW_ENABLED ?? "").trim().toLowerCase());
  const sweepRaw = Number(env.BEAT_PREVIEW_SWEEP_MS ?? "0");
  return {
    action: "run",
    workerRef: (env.BEAT_AUTO_CHECK_WORKER_REF ?? "").trim() || `auto-check-${pid}`,
    pollMs: Number.isFinite(pollRaw) && pollRaw >= 1000 ? pollRaw : 5000,
    acoustidKey: (env.ACOUSTID_CLIENT_KEY ?? "").trim() || undefined,
    pythonBin: env.BEAT_AUTO_CHECK_PYTHON ?? "python3",
    vocalScript: env.BEAT_AUTO_CHECK_VOCAL_SCRIPT ?? "scripts/auto-check/vocal_ratio.py",
    fpcalcBin: env.FPCALC_BIN ?? "fpcalc",
    maxDurationSeconds: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 900,
    previewEnabled,
    previewSweepMs:
      previewEnabled && Number.isFinite(sweepRaw) && sweepRaw >= 10_000 ? sweepRaw : 0,
  };
}
