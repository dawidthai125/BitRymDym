import {
  acquireIntegrationRunLock,
  defaultIntegrationLockPath,
  INTEGRATION_LOCK_TOKEN_VAR,
} from "./integration-run-lock";

/** Holds the per-stack integration lock in the main Vitest process for the whole run. */
export default function setup(): () => void {
  const handle = acquireIntegrationRunLock({
    lockPath: defaultIntegrationLockPath(process.env.LOCAL_SUPABASE_URL ?? ""),
    label: "vitest integration",
    reuseToken: process.env[INTEGRATION_LOCK_TOKEN_VAR],
  });
  const release = () => {
    handle.release();
  };
  // A hard kill skips both hooks; the next run then finds a dead PID and takes over.
  process.once("exit", release);
  return () => {
    process.off("exit", release);
    release();
  };
}
