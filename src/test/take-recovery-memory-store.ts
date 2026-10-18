/**
 * In-memory {@link TakeRecoveryStore} for unit tests: same contract as the
 * IndexedDB adapter (every operation serialised, records cloned in and out).
 */
import {
  TakeRecoveryStoreError,
  type TakeRecoveryMutation,
  type TakeRecoveryRecord,
  type TakeRecoveryStore,
} from "@/lib/takes/take-recording-recovery";

type Fault = "QUOTA" | "UNAVAILABLE";

export class MemoryTakeRecoveryStore implements TakeRecoveryStore {
  records = new Map<string, TakeRecoveryRecord>();
  chunks = new Map<string, Map<number, Blob>>();
  private chain: Promise<unknown> = Promise.resolve();
  /** Fault for the Nth transact call (1-based) or every call. */
  faultOnTransact: { at: number | "always"; fault: Fault } | null = null;
  /** Runs inside the serialised transaction before the mutation (e.g. another tab). */
  beforeTransact: ((call: number, store: MemoryTakeRecoveryStore) => void) | null = null;
  failRemove = false;
  transactCalls = 0;
  log: string[] = [];

  private serial<T>(task: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(task, task) as Promise<T>;
    this.chain = run.catch(() => undefined);
    return run;
  }

  transact(
    recoveryId: string,
    mutate: TakeRecoveryMutation,
    chunk?: { seq: number; blob: Blob },
  ) {
    return this.serial(() => {
      this.transactCalls += 1;
      this.beforeTransact?.(this.transactCalls, this);
      const f = this.faultOnTransact;
      if (f && (f.at === "always" || f.at === this.transactCalls)) {
        throw new TakeRecoveryStoreError(f.fault);
      }
      const current = this.records.get(recoveryId) ?? null;
      const next = mutate(current ? structuredClone(current) : null);
      this.records.set(recoveryId, structuredClone(next));
      if (chunk) {
        const map = this.chunks.get(recoveryId) ?? new Map<number, Blob>();
        map.set(chunk.seq, chunk.blob);
        this.chunks.set(recoveryId, map);
      }
      this.log.push(`transact:${next.status}:${next.upload?.stage ?? "-"}`);
      return structuredClone(next);
    });
  }

  list() {
    return this.serial(() => [...this.records.values()].map((r) => structuredClone(r)));
  }

  readChunks(recoveryId: string) {
    return this.serial(() =>
      [...(this.chunks.get(recoveryId) ?? new Map<number, Blob>()).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, blob]) => blob),
    );
  }

  remove(recoveryId: string) {
    return this.serial(() => {
      if (this.failRemove) throw new TakeRecoveryStoreError("UNAVAILABLE");
      this.records.delete(recoveryId);
      this.chunks.delete(recoveryId);
      this.log.push("remove");
    });
  }
}
