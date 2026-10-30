/** Kill switch + env parsing for the vocal cleanup worker (pure). Separate from the master worker. */
export type StudioCleanupWorkerConfig =
  | { action: "exit_disabled"; reason: string }
  | { action: "run"; workerRef: string; pollMs: number; timeoutMs: number };

const TRUE = new Set(["true", "1", "yes", "on"]);

export function decideStudioCleanupWorkerConfig(env: Record<string, string | undefined>, pid: number): StudioCleanupWorkerConfig {
  if (!TRUE.has((env.STUDIO_CLEANUP_ENABLED ?? "").trim().toLowerCase())) {
    return { action: "exit_disabled", reason: "STUDIO_CLEANUP_ENABLED not true" };
  }
  const poll = Number(env.STUDIO_CLEANUP_POLL_MS ?? "4000");
  const tmo = Number(env.STUDIO_CLEANUP_TIMEOUT_MS ?? "180000");
  return {
    action: "run",
    workerRef: (env.STUDIO_CLEANUP_WORKER_REF ?? "").trim() || `studio-cleanup-${pid}`,
    pollMs: Number.isFinite(poll) && poll >= 1000 ? poll : 4000,
    timeoutMs: Number.isFinite(tmo) && tmo >= 30000 ? tmo : 180000,
  };
}

/** Storage key of a cleaned take (audio-artifacts). Ids are validated uuids. */
export function cleanupObjectKey(ownerId: string, takeId: string, jobId: string): string {
  return `studio-cleanup/${ownerId}/${takeId}/${jobId}.flac`;
}
