/**
 * One integration run per local Supabase stack at a time.
 *
 * Integration files share one local database; two overlapping runs make
 * fixture cleanup and leftover measurements meaningless. The lock is a file
 * created with O_EXCL (`wx`), holding an owner token, PID and start time.
 *
 * - A live owner blocks the next run with a clear error.
 * - A lock whose PID is gone, or older than LOCK_MAX_AGE_MS (PID reuse), is
 *   stale: it is moved aside with an atomic rename and its token re-checked,
 *   so two contenders can never both take it over.
 * - Release deletes the file only while it still holds this run's token; an
 *   old run can never delete a newer run's lock.
 * - An outer script that already holds the lock exports its token in
 *   INTEGRATION_LOCK_TOKEN_VAR; nested runs then reuse it without releasing.
 */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const INTEGRATION_LOCK_TOKEN_VAR = "BRD_INTEGRATION_LOCK_TOKEN";
/** Longer than any integration run; past this a live PID is assumed reused. */
export const LOCK_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** A lock file that is still empty / partial this long after creation is abandoned. */
export const LOCK_UNREADABLE_GRACE_MS = 30_000;
const TAKEOVER_ATTEMPTS = 3;

export type IntegrationLockOwner = {
  token: string;
  pid: number;
  startedAt: string;
  label: string;
};

export type IntegrationLockHandle = {
  owner: IntegrationLockOwner;
  /** True when this handle created the lock (false for a reused outer lock). */
  owned: boolean;
  /** Deletes the lock only if it still carries this run's token. Idempotent. */
  release: () => boolean;
};

export type IntegrationLockOptions = {
  lockPath: string;
  label: string;
  pid?: number;
  now?: () => number;
  isProcessAlive?: (pid: number) => boolean;
  reuseToken?: string;
};

export class IntegrationRunLockedError extends Error {
  constructor(owner: IntegrationLockOwner | null, lockPath: string) {
    super(
      owner
        ? `[integration-lock] another integration run is active (pid ${owner.pid}, "${owner.label}", since ${owner.startedAt}). Lock: ${lockPath}`
        : `[integration-lock] another integration run is creating the lock. Lock: ${lockPath}`,
    );
    this.name = "IntegrationRunLockedError";
  }
}

export function defaultIntegrationLockPath(supabaseUrl: string): string {
  const key = createHash("sha256").update(supabaseUrl.trim().toLowerCase()).digest("hex").slice(0, 12);
  return path.join(os.tmpdir(), `bitrymdym-integration-${key}.lock`);
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function errno(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

export function readIntegrationLockOwner(file: string): IntegrationLockOwner | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (errno(error) === "ENOENT") return null;
    throw error;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<IntegrationLockOwner>;
    if (
      typeof parsed.token === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.startedAt === "string" &&
      typeof parsed.label === "string"
    ) {
      return parsed as IntegrationLockOwner;
    }
  } catch {
    // Partial write — handled by the unreadable grace period.
  }
  return null;
}

function tryCreate(lockPath: string, owner: IntegrationLockOwner): boolean {
  let fd: number;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (errno(error) === "EEXIST") return false;
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify(owner));
  } finally {
    closeSync(fd);
  }
  return true;
}

/** Stale lock → moved aside atomically; returns false if someone else won the race. */
function takeOverStale(lockPath: string, staleToken: string | null): boolean {
  const aside = `${lockPath}.stale-${randomUUID()}`;
  try {
    renameSync(lockPath, aside);
  } catch (error) {
    if (errno(error) === "ENOENT") return true;
    throw error;
  }
  const moved = readIntegrationLockOwner(aside);
  if ((moved?.token ?? null) === staleToken) {
    unlinkSync(aside);
    return true;
  }
  // A fresh lock replaced the stale one between the check and the rename: put it back.
  renameSync(aside, lockPath);
  return false;
}

export function acquireIntegrationRunLock(options: IntegrationLockOptions): IntegrationLockHandle {
  const { lockPath, label } = options;
  const now = options.now ?? Date.now;
  const alive = options.isProcessAlive ?? isProcessAlive;
  const pid = options.pid ?? process.pid;

  if (options.reuseToken) {
    const current = readIntegrationLockOwner(lockPath);
    if (current?.token === options.reuseToken && alive(current.pid)) {
      return { owner: current, owned: false, release: () => false };
    }
  }

  const owner: IntegrationLockOwner = {
    token: randomUUID(),
    pid,
    startedAt: new Date(now()).toISOString(),
    label,
  };

  for (let attempt = 0; attempt < TAKEOVER_ATTEMPTS; attempt += 1) {
    if (tryCreate(lockPath, owner)) {
      let released = false;
      return {
        owner,
        owned: true,
        release: () => {
          if (released) return false;
          const current = readIntegrationLockOwner(lockPath);
          if (current?.token !== owner.token) {
            released = true;
            return false;
          }
          try {
            unlinkSync(lockPath);
          } catch (error) {
            if (errno(error) !== "ENOENT") throw error;
          }
          released = true;
          return true;
        },
      };
    }

    const current = readIntegrationLockOwner(lockPath);
    let stale: boolean;
    if (current) {
      const age = now() - Date.parse(current.startedAt);
      stale = !alive(current.pid) || !(age < LOCK_MAX_AGE_MS);
    } else {
      let mtime: number;
      try {
        mtime = statSync(lockPath).mtimeMs;
      } catch (error) {
        if (errno(error) === "ENOENT") continue;
        throw error;
      }
      stale = now() - mtime >= LOCK_UNREADABLE_GRACE_MS;
    }
    if (!stale) throw new IntegrationRunLockedError(current, lockPath);
    takeOverStale(lockPath, current?.token ?? null);
  }
  throw new IntegrationRunLockedError(readIntegrationLockOwner(lockPath), lockPath);
}
