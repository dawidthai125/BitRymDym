/**
 * Phase 7.1.6 — Studio persist orchestrator (pure, no React / audio).
 * Serial FIFO queue + generation + bounded retry. No second persistence SSOT.
 */

export type StudioPersistStatus =
  | "CLEAN"
  | "DIRTY"
  | "SAVING"
  | "SAVE_FAILED"
  | "CONFLICT";

export type StudioPersistFailureKind =
  | "network"
  | "server"
  | "conflict"
  | "client"
  | "unknown";

export type StudioPersistResult =
  | {
      ok: true;
      documentVersion: number;
      /** Applied only if this persist generation is still current. */
      apply?: () => void;
    }
  | {
      ok: false;
      kind: StudioPersistFailureKind;
      status?: number;
      message: string;
      retryable: boolean;
    };

export type StudioPersistExecutor = () => Promise<StudioPersistResult>;

/**
 * CAS ack → next expectedDocumentVersion.
 * One helper for Inspector persist surfaces (markers / place / Scratch).
 * Does not replace editor docRef; Inspector must also ack the parent so
 * clip-move / patchClip read N+1 from docRef.
 */
export function resolveStudioPersistDocumentVersion(
  ack: unknown,
  fallback: number,
): number {
  if (typeof ack === "number" && Number.isInteger(ack) && ack >= 1) {
    return ack;
  }
  return fallback;
}

/** Apply a CAS ack into editor documentVersion without going backwards. */
export function advanceStudioPersistDocumentVersion(
  current: number,
  ack: unknown,
): number {
  const next = resolveStudioPersistDocumentVersion(ack, current);
  return next > current ? next : current;
}

export type StudioPersistVersionTip = {
  expected: () => number;
  applyAck: (ack: unknown) => number;
};

export function createStudioPersistVersionTip(
  getBase: () => number,
): StudioPersistVersionTip {
  let acked = 0;
  const expected = (): number => {
    const base = getBase();
    return acked > base ? acked : base;
  };
  return {
    expected,
    applyAck(ack: unknown): number {
      const next = resolveStudioPersistDocumentVersion(ack, expected());
      if (next > acked) acked = next;
      return next;
    },
  };
}

export type StudioPersistLabel =
  | "Gotowe"
  | "Zapisano"
  | "Niezapisane zmiany"
  | "Zapisywanie…"
  | "Nie zapisano"
  | string;

const RETRY_BACKOFF_MS = [1000, 3000, 8000] as const;
const MAX_AUTO_RETRIES = 3;
/** After the fast retries: keep trying quietly so a returning server is enough. */
export const PERSIST_SLOW_RETRY_MS = 30_000;
const SAVED_FLASH_MS = 2000;

export function classifyPersistHttpFailure(params: {
  status: number;
  message?: string;
  code?: string;
}): Extract<StudioPersistResult, { ok: false }> {
  if (params.status === 0) return classifyPersistNetworkFailure();
  const message = params.message ?? "Nie udało się zapisać.";
  if (
    params.status === 409 ||
    params.code === "FX_CHAIN_VERSION_CONFLICT" ||
    params.code === "IDEMPOTENCY_KEY_REUSE"
  ) {
    return {
      ok: false,
      kind: "conflict",
      status: 409,
      message,
      // Never auto-retry the same key with a different payload.
      retryable: false,
    };
  }
  if (params.status === 401 || params.status === 403 || params.status === 400) {
    return {
      ok: false,
      kind: "client",
      status: params.status,
      message,
      retryable: false,
    };
  }
  // 408 / 429: the server asked us to come back later.
  if (params.status >= 500 || params.status === 408 || params.status === 429) {
    return {
      ok: false,
      kind: "server",
      status: params.status,
      message,
      retryable: true,
    };
  }
  return {
    ok: false,
    kind: "unknown",
    status: params.status,
    message,
    retryable: false,
  };
}

export function classifyPersistNetworkFailure(
  message = "Brak połączenia. Zmiany nie zostały zapisane.",
): Extract<StudioPersistResult, { ok: false }> {
  return {
    ok: false,
    kind: "network",
    message,
    retryable: true,
  };
}

export function persistBackoffMs(attemptIndex: number): number | null {
  if (attemptIndex < 0 || attemptIndex >= MAX_AUTO_RETRIES) return null;
  return RETRY_BACKOFF_MS[attemptIndex] ?? null;
}

export type StudioPersistFailure = Extract<StudioPersistResult, { ok: false }>;

export type StudioPersistOrchestratorOptions = {
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  onChange?: (snapshot: StudioPersistSnapshot) => void;
  /** A mutation was dropped for good (refused by the server, or an awaited one ran out of retries). */
  onRejected?: (failure: StudioPersistFailure, info: { awaited: boolean }) => void;
  /** The queue is empty again and something in it was dropped: show the saved document. */
  onRollback?: () => void;
};

export type StudioPersistRequestOptions = {
  /** Adds / removes rows: the editor locks its controls until it is saved. */
  blocking?: boolean;
};

export type StudioPersistSnapshot = {
  status: StudioPersistStatus;
  generation: number;
  inFlight: boolean;
  queued: boolean;
  /** A blocking mutation is being saved. Never true while waiting for a retry. */
  blocking: boolean;
  /** Something the user changed is not on the server yet. */
  unsaved: boolean;
  autoRetryCount: number;
  label: StudioPersistLabel;
  conflict: boolean;
  lastError: string | null;
};

type QueueEntry = {
  run: StudioPersistExecutor;
  blocking: boolean;
  /** Resolves the caller of requestPersistAsync, exactly once. */
  settle: ((result: StudioPersistResult) => void) | null;
};

function defaultSchedule(fn: () => void, ms: number): { cancel: () => void } {
  const id = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(id) };
}

/**
 * Rules:
 * - strict FIFO; a later mutation never overtakes a failed one,
 * - a retryable failure stays at the head until it lands (fire-and-forget) or
 *   until the fast retries run out (awaited: the caller gets the failure and
 *   the mutation never runs again),
 * - a refused mutation is dropped, reported and rolled back, never re-run,
 * - every requestPersistAsync promise settles.
 */
export class StudioPersistOrchestrator {
  private status: StudioPersistStatus = "CLEAN";
  private generation = 0;
  private inFlight = false;
  private current: QueueEntry | null = null;
  /** FIFO — discrete mutations must not coalesce-drop. */
  private queue: QueueEntry[] = [];
  private autoRetryCount = 0;
  /** Fast retries used up; only slow / manual / online retries remain. */
  private stalled = false;
  private draftDirty = false;
  private rejectedMessage: string | null = null;
  private needsRollback = false;
  private lastError: string | null = null;
  private conflict = false;
  private disposed = false;
  private savedUntil = 0;
  private retryTimer: { cancel: () => void } | null = null;
  private flashTimer: { cancel: () => void } | null = null;
  private idleWaiters: Array<() => void> = [];
  private readonly now: () => number;
  private readonly schedule: (
    fn: () => void,
    ms: number,
  ) => { cancel: () => void };
  private readonly options: StudioPersistOrchestratorOptions;

  constructor(options: StudioPersistOrchestratorOptions = {}) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? defaultSchedule;
  }

  getSnapshot(): StudioPersistSnapshot {
    const queued = this.queue.length > 0;
    return {
      status: this.status,
      generation: this.generation,
      inFlight: this.inFlight,
      queued,
      blocking:
        this.autoRetryCount === 0 &&
        !this.stalled &&
        (Boolean(this.current?.blocking) || this.queue.some((e) => e.blocking)),
      unsaved: this.inFlight || queued || this.status === "DIRTY",
      autoRetryCount: this.autoRetryCount,
      label: this.computeLabel(),
      conflict: this.conflict,
      lastError: this.lastError,
    };
  }

  /** Mark local persistent draft / intent without starting a network save. */
  markDirty(): void {
    if (this.conflict) return;
    this.draftDirty = true;
    // Waiting for a retry: the pending save and its error stay visible.
    if (this.status === "SAVE_FAILED" && this.queue.length > 0) return;
    this.status = this.inFlight ? "SAVING" : "DIRTY";
    if (!this.inFlight) {
      this.savedUntil = 0;
      this.lastError = null;
      this.rejectedMessage = null;
    }
    this.emit();
  }

  /** The draft returned to the saved value: nothing left to save. */
  clearDirty(): void {
    this.draftDirty = false;
    if (this.status !== "DIRTY" || this.inFlight || this.queue.length > 0) return;
    this.status = "CLEAN";
    this.emit();
  }

  /**
   * Enqueue a persist. Serial FIFO — one in-flight; later mutations wait.
   */
  requestPersist(
    executor: StudioPersistExecutor,
    options: StudioPersistRequestOptions = {},
  ): void {
    this.enqueue({ run: executor, blocking: Boolean(options.blocking), settle: null });
  }

  /**
   * Enqueue and resolve with the final outcome: after apply on success, after
   * the last retry on failure. A failure means it will not run later.
   */
  requestPersistAsync(
    executor: StudioPersistExecutor,
    options: StudioPersistRequestOptions = {},
  ): Promise<StudioPersistResult> {
    if (this.conflict) return Promise.resolve(this.conflictResult());
    return new Promise((resolve) => {
      this.enqueue({
        run: executor,
        blocking: options.blocking ?? true,
        settle: resolve,
      });
    });
  }

  /** Manual flush — same queue; resets auto-retry budget. Always returns. */
  async flush(executor?: StudioPersistExecutor): Promise<StudioPersistSnapshot> {
    if (this.conflict) return this.getSnapshot();
    if (executor) {
      this.generation += 1;
      this.queue.push({ run: executor, blocking: false, settle: null });
    }
    this.resetRetryBudget();
    void this.drain();
    return this.whenIdle();
  }

  /** Resolves when nothing is being saved (empty queue, conflict, or retries used up). */
  whenIdle(): Promise<StudioPersistSnapshot> {
    if (this.isIdle()) return Promise.resolve(this.getSnapshot());
    return new Promise((resolve) => {
      this.idleWaiters.push(() => resolve(this.getSnapshot()));
    });
  }

  /** "Try again" / network back / tab visible — retry only if a save is waiting. */
  retryNow(): void {
    if (this.conflict || this.inFlight || this.queue.length === 0) return;
    this.resetRetryBudget();
    void this.drain();
  }

  onOnline(): void {
    this.retryNow();
  }

  /** Editor unmounted: stop notifying, but finish what the user already changed. */
  dispose(): void {
    this.disposed = true;
    this.clearFlashTimer();
    this.retryNow();
  }

  private enqueue(entry: QueueEntry): void {
    if (this.conflict) {
      entry.settle?.(this.conflictResult());
      return;
    }
    const idle = !this.inFlight && this.queue.length === 0;
    this.generation += 1;
    this.queue.push(entry);
    this.draftDirty = false;
    this.savedUntil = 0;
    if (idle) {
      this.lastError = null;
      this.rejectedMessage = null;
    }
    if (this.inFlight) {
      this.status = "SAVING";
      this.emit();
      return;
    }
    this.clearRetryTimer();
    this.status = "DIRTY";
    this.emit();
    void this.drain();
  }

  private conflictResult(): StudioPersistFailure {
    return {
      ok: false,
      kind: "conflict",
      status: 409,
      message: this.lastError ?? "Projekt został zmieniony. Odśwież stronę.",
      retryable: false,
    };
  }

  private computeLabel(): StudioPersistLabel {
    if (this.conflict) {
      return this.lastError ?? "Projekt został zmieniony. Odśwież stronę.";
    }
    if (this.status === "SAVE_FAILED") return "Nie zapisano";
    if (this.status === "SAVING" || this.inFlight) return "Zapisywanie…";
    if (this.status === "DIRTY" || this.queue.length > 0) {
      return "Niezapisane zmiany";
    }
    if (this.savedUntil > this.now()) return "Zapisano";
    return "Gotowe";
  }

  private emit(): void {
    if (!this.disposed) this.options.onChange?.(this.getSnapshot());
  }

  private isIdle(): boolean {
    if (this.inFlight) return false;
    return this.conflict || this.queue.length === 0 || this.stalled;
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const waiter of waiters) waiter();
  }

  private resetRetryBudget(): void {
    this.autoRetryCount = 0;
    this.stalled = false;
    this.clearRetryTimer();
  }

  private clearRetryTimer(): void {
    this.retryTimer?.cancel();
    this.retryTimer = null;
  }

  private clearFlashTimer(): void {
    this.flashTimer?.cancel();
    this.flashTimer = null;
  }

  private reject(entry: QueueEntry, failure: StudioPersistFailure): void {
    this.needsRollback = true;
    this.rejectedMessage = failure.message;
    if (!this.disposed) {
      this.options.onRejected?.(failure, { awaited: entry.settle !== null });
    }
    entry.settle?.(failure);
  }

  /** Nothing in flight, nothing queued. */
  private finishQueue(): void {
    if (this.needsRollback) {
      this.needsRollback = false;
      if (!this.disposed) this.options.onRollback?.();
    }
    if (this.rejectedMessage !== null) {
      this.status = "SAVE_FAILED";
      this.lastError = this.rejectedMessage;
    } else if (this.draftDirty) {
      this.status = "DIRTY";
    } else {
      this.status = "CLEAN";
      this.lastError = null;
      this.savedUntil = this.now() + SAVED_FLASH_MS;
      this.clearFlashTimer();
      if (!this.disposed) {
        this.flashTimer = this.schedule(() => {
          this.flashTimer = null;
          if (this.status === "CLEAN") this.emit();
        }, SAVED_FLASH_MS);
      }
    }
    this.emit();
    this.notifyIdle();
  }

  private async drain(): Promise<void> {
    if (this.inFlight || this.conflict) return;
    const entry = this.queue.shift();
    if (!entry) return;

    this.clearRetryTimer();
    this.inFlight = true;
    this.current = entry;
    this.status = "SAVING";
    this.emit();

    let result: StudioPersistResult;
    try {
      result = await entry.run();
    } catch {
      result = classifyPersistNetworkFailure();
    }

    this.inFlight = false;
    this.current = null;

    if (result.ok) {
      this.autoRetryCount = 0;
      this.stalled = false;
      // Always apply CAS ack before the next queued mutation (N → N+1).
      try {
        result.apply?.();
      } catch (error) {
        console.error("studio persist: apply failed", error);
      }
      entry.settle?.(result);
      this.next();
      return;
    }

    if (result.kind === "conflict") {
      this.conflict = true;
      this.status = "CONFLICT";
      this.lastError = result.message;
      const dropped = this.queue;
      this.queue = [];
      this.clearRetryTimer();
      entry.settle?.(result);
      for (const other of dropped) other.settle?.(this.conflictResult());
      this.emit();
      this.notifyIdle();
      return;
    }

    if (!result.retryable) {
      this.autoRetryCount = 0;
      this.stalled = false;
      this.reject(entry, result);
      this.next();
      return;
    }

    this.keepForRetry(entry, result);
  }

  private next(): void {
    if (this.queue.length === 0) {
      this.finishQueue();
      return;
    }
    this.status = "DIRTY";
    this.emit();
    void this.drain();
  }

  /** Server / network failure: the mutation stays first and everything behind it waits. */
  private keepForRetry(entry: QueueEntry, failure: StudioPersistFailure): void {
    this.queue.unshift(entry);
    this.lastError = failure.message;
    this.status = "SAVE_FAILED";

    const wait = this.stalled ? null : persistBackoffMs(this.autoRetryCount);
    if (wait !== null) {
      this.autoRetryCount += 1;
      this.scheduleRetry(wait);
      this.emit();
      return;
    }

    this.stalled = true;
    // Awaited callers get their answer now and must not run behind their back later.
    const kept: QueueEntry[] = [];
    for (const item of this.queue) {
      if (item.settle) this.reject(item, failure);
      else kept.push(item);
    }
    this.queue = this.disposed ? [] : kept;
    if (this.queue.length === 0) {
      this.stalled = false;
      this.autoRetryCount = 0;
      this.finishQueue();
      return;
    }
    this.scheduleRetry(PERSIST_SLOW_RETRY_MS);
    this.emit();
    this.notifyIdle();
  }

  private scheduleRetry(ms: number): void {
    this.clearRetryTimer();
    this.retryTimer = this.schedule(() => {
      this.retryTimer = null;
      void this.drain();
    }, ms);
  }
}
