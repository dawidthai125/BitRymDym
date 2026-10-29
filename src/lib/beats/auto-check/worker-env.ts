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
    };

const TRUE = new Set(["true", "1", "yes", "on"]);

export function decideAutoCheckWorkerConfig(env: Record<string, string | undefined>, pid: number): AutoCheckWorkerConfig {
  if (!TRUE.has((env.BEAT_AUTO_CHECK_ENABLED ?? "").trim().toLowerCase())) {
    return { action: "exit_disabled", reason: "BEAT_AUTO_CHECK_ENABLED not true" };
  }
  const pollRaw = Number(env.BEAT_AUTO_CHECK_POLL_MS ?? "5000");
  const maxRaw = Number(env.BEAT_AUTO_CHECK_MAX_SECONDS ?? "900");
  return {
    action: "run",
    workerRef: (env.BEAT_AUTO_CHECK_WORKER_REF ?? "").trim() || `auto-check-${pid}`,
    pollMs: Number.isFinite(pollRaw) && pollRaw >= 1000 ? pollRaw : 5000,
    acoustidKey: (env.ACOUSTID_CLIENT_KEY ?? "").trim() || undefined,
    pythonBin: env.BEAT_AUTO_CHECK_PYTHON ?? "python3",
    vocalScript: env.BEAT_AUTO_CHECK_VOCAL_SCRIPT ?? "scripts/auto-check/vocal_ratio.py",
    fpcalcBin: env.FPCALC_BIN ?? "fpcalc",
    maxDurationSeconds: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 900,
  };
}
