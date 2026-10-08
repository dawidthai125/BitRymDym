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

export type StudioPersistLabel =
  | "Gotowe"
  | "Zapisano"
  | "Niezapisane zmiany"
  | "Zapisywanie…"
  | "Nie zapisano"
  | string;

const RETRY_BACKOFF_MS = [1000, 3000, 8000] as const;
const MAX_AUTO_RETRIES = 3;
const SAVED_FLASH_MS = 2000;

export function classifyPersistHttpFailure(params: {
  status: number;
  message?: string;
  code?: string;
}): Extract<StudioPersistResult, { ok: false }> {
  const message = params.message ?? "Nie udało się zapisać.";
  if (params.status === 409 || params.code === "FX_CHAIN_VERSION_CONFLICT") {
    return {
      ok: false,
      kind: "conflict",
      status: 409,
      message,
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
  if (params.status >= 500) {
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

export type StudioPersistOrchestratorOptions = {
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  onChange?: (snapshot: StudioPersistSnapshot) => void;
};

export type StudioPersistSnapshot = {
  status: StudioPersistStatus;
  generation: number;
  inFlight: boolean;
  queued: boolean;
  autoRetryCount: number;
  label: StudioPersistLabel;
  conflict: boolean;
  lastError: string | null;
};

function defaultSchedule(fn: () => void, ms: number): { cancel: () => void } {
  const id = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(id) };
}

export class StudioPersistOrchestrator {
  private status: StudioPersistStatus = "CLEAN";
  private generation = 0;
  private inFlight = false;
  /** FIFO — discrete mutations must not coalesce-drop. */
  private queue: StudioPersistExecutor[] = [];
  private autoRetryCount = 0;
  private lastError: string | null = null;
  private conflict = false;
  private savedUntil = 0;
  private retryTimer: { cancel: () => void } | null = null;
  private flashTimer: { cancel: () => void } | null = null;
  private readonly now: () => number;
  private readonly schedule: (
    fn: () => void,
    ms: number,
  ) => { cancel: () => void };
  private readonly onChange?: (snapshot: StudioPersistSnapshot) => void;

  constructor(options: StudioPersistOrchestratorOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? defaultSchedule;
    this.onChange = options.onChange;
  }

  getSnapshot(): StudioPersistSnapshot {
    return {
      status: this.status,
      generation: this.generation,
      inFlight: this.inFlight,
      queued: this.queue.length > 0,
      autoRetryCount: this.autoRetryCount,
      label: this.computeLabel(),
      conflict: this.conflict,
      lastError: this.lastError,
    };
  }

  /** Mark local persistent draft / intent without starting a network save. */
  markDirty(): void {
    if (this.conflict) return;
    this.clearRetryTimer();
    this.status = this.inFlight ? "SAVING" : "DIRTY";
    if (!this.inFlight) {
      this.savedUntil = 0;
      this.lastError = null;
    }
    this.emit();
  }

  /**
   * Enqueue a persist. Serial FIFO — one in-flight; later mutations wait.
   */
  requestPersist(executor: StudioPersistExecutor): void {
    if (this.conflict) return;
    this.generation += 1;
    this.queue.push(executor);
    this.clearRetryTimer();
    this.autoRetryCount = 0;
    this.lastError = null;
    this.savedUntil = 0;
    if (this.inFlight) {
      this.status = "SAVING";
      this.emit();
      return;
    }
    this.status = "DIRTY";
    this.emit();
    void this.drain();
  }

  /**
   * Enqueue and resolve when this executor finishes (after apply on success).
   */
  requestPersistAsync(
    executor: StudioPersistExecutor,
  ): Promise<StudioPersistResult> {
    if (this.conflict) {
      return Promise.resolve({
        ok: false,
        kind: "conflict",
        status: 409,
        message: this.lastError ?? "Projekt został zmieniony. Odśwież stronę.",
        retryable: false,
      });
    }
    return new Promise((resolve) => {
      this.requestPersist(async () => {
        const result = await executor();
        if (result.ok) {
          return {
            ok: true as const,
            documentVersion: result.documentVersion,
            apply: () => {
              try {
                result.apply?.();
              } finally {
                resolve(result);
              }
            },
          };
        }
        resolve(result);
        return result;
      });
    });
  }

  /** Manual flush — same queue; resets auto-retry budget. */
  async flush(executor?: StudioPersistExecutor): Promise<StudioPersistSnapshot> {
    if (this.conflict) return this.getSnapshot();
    if (executor) {
      this.generation += 1;
      this.queue.push(executor);
    }
    this.autoRetryCount = 0;
    this.clearRetryTimer();
    if (!this.inFlight && this.queue.length > 0) {
      await this.drain();
    }
    if (this.inFlight || this.queue.length > 0 || this.retryTimer) {
      await this.waitUntilIdle();
    }
    return this.getSnapshot();
  }

  /** Online recovery — retry only if SAVE_FAILED with pending work. */
  onOnline(): void {
    if (this.conflict || this.status !== "SAVE_FAILED" || this.queue.length === 0)
      return;
    this.autoRetryCount = 0;
    this.clearRetryTimer();
    void this.drain();
  }

  dispose(): void {
    this.clearRetryTimer();
    this.clearFlashTimer();
    this.queue = [];
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
    this.onChange?.(this.getSnapshot());
  }

  private clearRetryTimer(): void {
    this.retryTimer?.cancel();
    this.retryTimer = null;
  }

  private clearFlashTimer(): void {
    this.flashTimer?.cancel();
    this.flashTimer = null;
  }

  private waitUntilIdle(): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (!this.inFlight && this.queue.length === 0 && !this.retryTimer) {
          resolve();
          return;
        }
        this.schedule(tick, 16);
      };
      tick();
    });
  }

  private async drain(): Promise<void> {
    if (this.inFlight || this.conflict) return;
    const executor = this.queue.shift();
    if (!executor) {
      if (this.status !== "SAVE_FAILED") {
        this.status = "CLEAN";
        this.emit();
      }
      return;
    }

    const genAtStart = this.generation;
    this.inFlight = true;
    this.status = "SAVING";
    this.emit();

    let result: StudioPersistResult;
    try {
      result = await executor();
    } catch (error) {
      result = classifyPersistNetworkFailure(
        error instanceof Error ? error.message : undefined,
      );
    }

    this.inFlight = false;

    if (result.ok) {
      // Always apply CAS ack before the next queued mutation (N → N+1).
      result.apply?.();
      this.autoRetryCount = 0;
      this.lastError = null;
      if (this.queue.length > 0) {
        this.status = "DIRTY";
        this.emit();
        void this.drain();
        return;
      }
      if (genAtStart !== this.generation) {
        this.status = "DIRTY";
        this.emit();
        return;
      }
      this.status = "CLEAN";
      this.savedUntil = this.now() + SAVED_FLASH_MS;
      this.clearFlashTimer();
      this.flashTimer = this.schedule(() => {
        this.flashTimer = null;
        if (this.status === "CLEAN") this.emit();
      }, SAVED_FLASH_MS);
      this.emit();
      return;
    }

    if (result.kind === "conflict") {
      this.conflict = true;
      this.status = "CONFLICT";
      this.lastError = result.message;
      this.queue = [];
      this.clearRetryTimer();
      this.emit();
      return;
    }

    this.lastError = result.message;
    this.status = "SAVE_FAILED";

    if (this.queue.length > 0) {
      // Newer discrete mutations wait with unchanged version (A did not apply).
      this.status = "DIRTY";
      this.emit();
      void this.drain();
      return;
    }

    // Re-queue failed executor for bounded retry.
    this.queue.unshift(executor);
    this.emit();

    if (result.retryable && this.autoRetryCount < MAX_AUTO_RETRIES) {
      const wait = persistBackoffMs(this.autoRetryCount);
      this.autoRetryCount += 1;
      if (wait != null) {
        this.clearRetryTimer();
        this.retryTimer = this.schedule(() => {
          this.retryTimer = null;
          void this.drain();
        }, wait);
      }
    }
  }
}
