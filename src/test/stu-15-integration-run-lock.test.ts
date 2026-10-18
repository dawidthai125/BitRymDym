/**
 * STU-15 C — integration run lock: atomic, stale-safe, owner-only release.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  acquireIntegrationRunLock,
  defaultIntegrationLockPath,
  type IntegrationLockOwner,
  IntegrationRunLockedError,
  isProcessAlive,
  LOCK_MAX_AGE_MS,
  LOCK_UNREADABLE_GRACE_MS,
  readIntegrationLockOwner,
} from "@/test/integration-run-lock";

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "stu15-lock-"));
  lockPath = path.join(dir, "run.lock");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeOwner(owner: Partial<IntegrationLockOwner>) {
  writeFileSync(
    lockPath,
    JSON.stringify({
      token: "foreign-token",
      pid: 424242,
      startedAt: new Date().toISOString(),
      label: "other run",
      ...owner,
    }),
  );
}

const leftovers = () => readdirSync(dir).filter((name) => name !== "run.lock");

describe("STU-15 C — integration run lock", () => {
  it("acquire writes the owner atomically; release removes it and is idempotent", () => {
    const handle = acquireIntegrationRunLock({ lockPath, label: "run A" });
    expect(handle.owned).toBe(true);
    expect(readIntegrationLockOwner(lockPath)).toEqual(handle.owner);
    expect(handle.owner.pid).toBe(process.pid);
    expect(handle.release()).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
    expect(handle.release()).toBe(false);
  });

  it("a live owner blocks the second run and keeps its lock", () => {
    const first = acquireIntegrationRunLock({ lockPath, label: "run A" });
    const error = (() => {
      try {
        acquireIntegrationRunLock({ lockPath, label: "run B" });
      } catch (caught) {
        return caught as Error;
      }
      throw new Error("expected IntegrationRunLockedError");
    })();
    expect(error).toBeInstanceOf(IntegrationRunLockedError);
    expect(error.message).toContain(`pid ${process.pid}`);
    expect(error.message).toContain("run A");
    expect(readIntegrationLockOwner(lockPath)?.token).toBe(first.owner.token);
    first.release();
  });

  it("a lock left by a dead process is taken over without leaving files behind", () => {
    writeOwner({ token: "crashed", pid: 999_001 });
    const handle = acquireIntegrationRunLock({
      lockPath,
      label: "run B",
      isProcessAlive: (pid) => pid !== 999_001,
    });
    expect(handle.owned).toBe(true);
    expect(readIntegrationLockOwner(lockPath)?.token).toBe(handle.owner.token);
    expect(leftovers()).toEqual([]);
    handle.release();
  });

  it("an old run never deletes the lock of the run that took over", () => {
    const old = acquireIntegrationRunLock({ lockPath, label: "run A", pid: 999_002 });
    const next = acquireIntegrationRunLock({
      lockPath,
      label: "run B",
      isProcessAlive: (pid) => pid !== 999_002,
    });
    expect(old.release()).toBe(false);
    expect(readIntegrationLockOwner(lockPath)?.token).toBe(next.owner.token);
    expect(next.release()).toBe(true);
  });

  it("past the max age a live PID is treated as reused", () => {
    const start = Date.parse("2026-10-18T08:00:00Z");
    writeOwner({ token: "ancient", pid: process.pid, startedAt: new Date(start).toISOString() });
    const blocked = () =>
      acquireIntegrationRunLock({ lockPath, label: "run B", now: () => start + LOCK_MAX_AGE_MS - 1 });
    expect(blocked).toThrow(IntegrationRunLockedError);
    const handle = acquireIntegrationRunLock({
      lockPath,
      label: "run B",
      now: () => start + LOCK_MAX_AGE_MS,
    });
    expect(handle.owned).toBe(true);
    handle.release();
  });

  it("a partially written lock blocks during the grace period and is reclaimed after it", () => {
    writeFileSync(lockPath, "{\"tok");
    expect(() => acquireIntegrationRunLock({ lockPath, label: "run B" })).toThrow(
      IntegrationRunLockedError,
    );
    const old = (Date.now() - LOCK_UNREADABLE_GRACE_MS - 5_000) / 1000;
    utimesSync(lockPath, old, old);
    const handle = acquireIntegrationRunLock({ lockPath, label: "run B" });
    expect(handle.owned).toBe(true);
    expect(leftovers()).toEqual([]);
    handle.release();
  });

  it("takeover race: a fresh lock created after the stale check is put back, not stolen", () => {
    writeOwner({ token: "crashed", pid: 999_003 });
    const contender = () =>
      acquireIntegrationRunLock({
        lockPath,
        label: "run C",
        isProcessAlive: (pid) => {
          if (pid === 999_003) {
            // Another run takes the stale lock between our check and our rename.
            writeOwner({ token: "winner", pid: process.pid, label: "run B" });
            return false;
          }
          return true;
        },
      });
    expect(contender).toThrow(IntegrationRunLockedError);
    expect(readIntegrationLockOwner(lockPath)?.token).toBe("winner");
    expect(leftovers()).toEqual([]);
  });

  it("an outer holder's token is reused without creating or releasing the lock", () => {
    const outer = acquireIntegrationRunLock({ lockPath, label: "leftover measurement" });
    const nested = acquireIntegrationRunLock({
      lockPath,
      label: "vitest integration",
      reuseToken: outer.owner.token,
    });
    expect(nested.owned).toBe(false);
    expect(nested.release()).toBe(false);
    expect(readIntegrationLockOwner(lockPath)?.token).toBe(outer.owner.token);
    expect(() =>
      acquireIntegrationRunLock({ lockPath, label: "vitest integration", reuseToken: "guessed" }),
    ).toThrow(IntegrationRunLockedError);
    outer.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("a really killed owner process frees the lock for the next run", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    const pid = child.pid!;
    try {
      writeOwner({ token: "child", pid });
      expect(isProcessAlive(pid)).toBe(true);
      expect(() => acquireIntegrationRunLock({ lockPath, label: "run B" })).toThrow(
        IntegrationRunLockedError,
      );
      const exited = new Promise((done) => child.once("exit", done));
      child.kill("SIGKILL");
      await exited;
      expect(isProcessAlive(pid)).toBe(false);
      const handle = acquireIntegrationRunLock({ lockPath, label: "run B" });
      expect(handle.owned).toBe(true);
      handle.release();
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("lock path is per stack and never embeds the URL", () => {
    const local = defaultIntegrationLockPath("http://127.0.0.1:54321");
    expect(local).toBe(defaultIntegrationLockPath("HTTP://127.0.0.1:54321 "));
    expect(local).not.toBe(defaultIntegrationLockPath("http://127.0.0.1:55321"));
    expect(path.dirname(local)).toBe(os.tmpdir());
    expect(path.basename(local)).toMatch(/^bitrymdym-integration-[0-9a-f]{12}\.lock$/);
  });
});
