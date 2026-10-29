/** Kill switch + env parsing for the Studio master worker (pure). */
export type StudioMasterWorkerConfig =
  | { action: "exit_disabled"; reason: string }
  | { action: "run"; workerRef: string; pollMs: number; pythonBin: string; masterScript: string; timeoutMs: number };

const TRUE = new Set(["true", "1", "yes", "on"]);

export function decideStudioMasterWorkerConfig(env: Record<string, string | undefined>, pid: number): StudioMasterWorkerConfig {
  if (!TRUE.has((env.STUDIO_MASTER_ENABLED ?? "").trim().toLowerCase())) {
    return { action: "exit_disabled", reason: "STUDIO_MASTER_ENABLED not true" };
  }
  const poll = Number(env.STUDIO_MASTER_POLL_MS ?? "4000");
  const tmo = Number(env.STUDIO_MASTER_TIMEOUT_MS ?? "600000");
  return {
    action: "run",
    workerRef: (env.STUDIO_MASTER_WORKER_REF ?? "").trim() || `studio-master-${pid}`,
    pollMs: Number.isFinite(poll) && poll >= 1000 ? poll : 4000,
    pythonBin: env.STUDIO_MASTER_PYTHON ?? "python3",
    masterScript: env.STUDIO_MASTER_SCRIPT ?? "scripts/master/master.py",
    timeoutMs: Number.isFinite(tmo) && tmo >= 30000 ? tmo : 600000,
  };
}
