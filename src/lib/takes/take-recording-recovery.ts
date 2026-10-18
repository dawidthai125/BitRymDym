/**
 * STU-14/STU-15 — browser-local recovery of unsaved recordings, shared by the
 * Studio recording panel and Quick Take.
 *
 * Audio chunks are persisted incrementally while recording, so a closed panel,
 * route change, reload or crash leaves a consistent local prefix. The server
 * take identity (`takeId` from the take session endpoints) stays the only take
 * identity; `recoveryId` only names the local copy before a session exists.
 * The local copy never holds tokens or signed URLs.
 *
 * All record transitions are pure functions applied inside one store
 * transaction, so the IndexedDB adapter and the in-memory test store share
 * the same rules.
 */

import {
  RECORDING_GLOBAL_MAX_SECONDS,
  TAKE_AUDIO_MAX_BYTES,
  TAKE_LOCAL_RECOVERY_TTL_SECONDS,
  TAKE_PENDING_UPLOAD_WINDOW_SECONDS,
} from "@/config/recording";
import { normalizeTakeContentType } from "@/lib/takes/validation";
import { looksLikePolishUserMessage } from "@/lib/ui/user-errors";

/** v2 (STU-15): surface + owner binding + lease `acquiredAt`. */
export const TAKE_RECOVERY_FORMAT_VERSION = 2;

/** A RECORDING copy updated more recently than this is being captured by some tab. */
export const TAKE_RECOVERY_LIVE_STALE_MS = 10_000;

/** Exclusive lease for upload/recovery/discard. */
export const TAKE_RECOVERY_CLAIM_LEASE_MS = 120_000;

/** An active operation renews its lease this often while it runs. */
export const TAKE_RECOVERY_CLAIM_RENEW_MS = 30_000;

/** A lease is never extended past this hold time; it then simply lapses. */
export const TAKE_RECOVERY_CLAIM_MAX_HOLD_MS = 15 * 60_000;

/** Wall-clock slack over the recording limit (timeslice + stop latency). */
export const TAKE_RECOVERY_DURATION_SLACK_MS = 5_000;

export type TakeRecoveryStatus = "RECORDING" | "COMPLETE" | "INTERRUPTED";

export type TakeRecoverySurface = "STUDIO" | "QUICK_TAKE";

export type TakeRecoveryUploadStage =
  | "SESSION_CREATED"
  | "BINARY_UPLOADED"
  | "FINALIZED";

export type TakeRecoveryClaim = {
  owner: string;
  acquiredAt: number;
  expiresAt: number;
};

export type TakeRecoveryRecord = {
  formatVersion: number;
  recoveryId: string;
  surface: TakeRecoverySurface;
  /** Studio project; null for Quick Take. */
  projectId: string | null;
  /** Account that recorded; null = guest (anonymous take endpoints). */
  ownerUserId: string | null;
  beatId: string;
  mimeType: string;
  maxRecordingSeconds: number;
  startedAt: number;
  updatedAt: number;
  status: TakeRecoveryStatus;
  chunkCount: number;
  byteSize: number;
  upload: { stage: TakeRecoveryUploadStage; takeId: string } | null;
  claim: TakeRecoveryClaim | null;
};

export type TakeRecoveryStoreErrorCode =
  | "UNAVAILABLE"
  | "QUOTA"
  | "NOT_FOUND"
  | "EXISTS"
  | "INCONSISTENT"
  | "LIMIT"
  | "BUSY"
  | "LEASE_LOST";

export class TakeRecoveryStoreError extends Error {
  readonly code: TakeRecoveryStoreErrorCode;

  constructor(code: TakeRecoveryStoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TakeRecoveryStoreError";
    this.code = code;
  }
}

/**
 * The local copy was taken over by another tab (or already handled), so this
 * tab must not finalize it. Thrown from the upload stage hook, which aborts
 * the transport before finalize.
 */
export class TakeRecoveryLeaseLostError extends Error {
  constructor() {
    super(
      "Zapis tego nagrania przejęła inna karta albo lokalna kopia została już obsłużona — ta karta nie dokończy zapisu.",
    );
    this.name = "TakeRecoveryLeaseLostError";
  }
}

function isLeaseLoss(error: unknown): boolean {
  return (
    error instanceof TakeRecoveryStoreError &&
    (error.code === "LEASE_LOST" || error.code === "NOT_FOUND")
  );
}

export type TakeRecoveryMutation = (
  current: TakeRecoveryRecord | null,
) => TakeRecoveryRecord;

export interface TakeRecoveryStore {
  /**
   * Atomically read the record, apply `mutate` (synchronous; throws to abort)
   * and write the result together with the optional chunk.
   */
  transact(
    recoveryId: string,
    mutate: TakeRecoveryMutation,
    chunk?: { seq: number; blob: Blob },
  ): Promise<TakeRecoveryRecord>;
  list(): Promise<TakeRecoveryRecord[]>;
  /** Chunks ordered by seq. */
  readChunks(recoveryId: string): Promise<Blob[]>;
  /** Removes the record and all its chunks. */
  remove(recoveryId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure transitions
// ---------------------------------------------------------------------------

function validScope(input: {
  surface: TakeRecoverySurface;
  projectId: string | null;
}): boolean {
  if (input.surface === "STUDIO") {
    return typeof input.projectId === "string" && input.projectId.length > 0;
  }
  return input.surface === "QUICK_TAKE" && input.projectId === null;
}

export function createRecoveryRecordMutation(input: {
  recoveryId: string;
  surface: TakeRecoverySurface;
  projectId: string | null;
  ownerUserId: string | null;
  beatId: string;
  mimeType: string;
  maxRecordingSeconds: number;
  now: number;
}): TakeRecoveryMutation {
  return (current) => {
    if (current) throw new TakeRecoveryStoreError("EXISTS");
    if (!validScope(input)) throw new TakeRecoveryStoreError("INCONSISTENT");
    return {
      formatVersion: TAKE_RECOVERY_FORMAT_VERSION,
      recoveryId: input.recoveryId,
      surface: input.surface,
      projectId: input.projectId,
      ownerUserId: input.ownerUserId,
      beatId: input.beatId,
      mimeType: input.mimeType,
      maxRecordingSeconds: input.maxRecordingSeconds,
      startedAt: input.now,
      updatedAt: input.now,
      status: "RECORDING",
      chunkCount: 0,
      byteSize: 0,
      upload: null,
      claim: null,
    };
  };
}

export function appendChunkMutation(
  seq: number,
  size: number,
  now: number,
): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    if (current.status !== "RECORDING" || seq !== current.chunkCount) {
      throw new TakeRecoveryStoreError("INCONSISTENT");
    }
    if (current.byteSize + size > TAKE_AUDIO_MAX_BYTES) {
      throw new TakeRecoveryStoreError("LIMIT");
    }
    return {
      ...current,
      chunkCount: current.chunkCount + 1,
      byteSize: current.byteSize + size,
      updatedAt: now,
    };
  };
}

function newClaim(claimant: string, now: number): TakeRecoveryClaim {
  return {
    owner: claimant,
    acquiredAt: now,
    expiresAt: now + TAKE_RECOVERY_CLAIM_LEASE_MS,
  };
}

/** Never shortens a lease and never extends it past the max hold time. */
function extendClaim(claim: TakeRecoveryClaim, now: number): TakeRecoveryClaim {
  const cap = claim.acquiredAt + TAKE_RECOVERY_CLAIM_MAX_HOLD_MS;
  return {
    ...claim,
    expiresAt: Math.max(
      claim.expiresAt,
      Math.min(now + TAKE_RECOVERY_CLAIM_LEASE_MS, cap),
    ),
  };
}

/**
 * Compare-and-set on the lease owner. An expired lease that nobody else took
 * over is still ours; a lease taken, released or removed by anyone else is lost.
 */
function assertOwnClaim(
  current: TakeRecoveryRecord,
  claimant: string,
): TakeRecoveryClaim {
  if (!current.claim || current.claim.owner !== claimant) {
    throw new TakeRecoveryStoreError("LEASE_LOST");
  }
  return current.claim;
}

/**
 * COMPLETE requires every chunk the recorder produced to be stored
 * (`expectedChunkCount`); INTERRUPTED seals whatever consistent prefix exists.
 * COMPLETE also takes the upload lease for `claimant`.
 */
export function finishRecordingMutation(params: {
  status: "COMPLETE" | "INTERRUPTED";
  expectedChunkCount: number | null;
  claimant: string;
  now: number;
}): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    if (current.status !== "RECORDING") {
      throw new TakeRecoveryStoreError("INCONSISTENT");
    }
    if (
      params.status === "COMPLETE" &&
      params.expectedChunkCount !== current.chunkCount
    ) {
      throw new TakeRecoveryStoreError("INCONSISTENT");
    }
    return {
      ...current,
      status: params.status,
      updatedAt: params.now,
      claim:
        params.status === "COMPLETE"
          ? newClaim(params.claimant, params.now)
          : null,
    };
  };
}

function isLiveRecording(record: TakeRecoveryRecord, now: number): boolean {
  return (
    record.status === "RECORDING" &&
    now - record.updatedAt < TAKE_RECOVERY_LIVE_STALE_MS
  );
}

function claimHeldByOther(
  record: TakeRecoveryRecord,
  claimant: string,
  now: number,
): boolean {
  return (
    record.claim != null &&
    record.claim.owner !== claimant &&
    record.claim.expiresAt > now
  );
}

/** Exclusive lease (multi-tab safe: the store serialises transactions). */
export function claimMutation(
  claimant: string,
  now: number,
): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    if (isLiveRecording(current, now) || claimHeldByOther(current, claimant, now)) {
      throw new TakeRecoveryStoreError("BUSY");
    }
    return {
      ...current,
      status: current.status === "RECORDING" ? "INTERRUPTED" : current.status,
      claim: newClaim(claimant, now),
    };
  };
}

/** Extends the caller's own lease (bounded); throws LEASE_LOST otherwise. */
export function renewClaimMutation(
  claimant: string,
  now: number,
): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    const claim = assertOwnClaim(current, claimant);
    return { ...current, claim: extendClaim(claim, now) };
  };
}

/** Idempotent; never releases a lease that belongs to someone else. */
export function releaseClaimMutation(claimant: string): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    if (current.claim && current.claim.owner !== claimant) return current;
    return { ...current, claim: null };
  };
}

/** Records a server-confirmed stage; a known take identity can never change. */
export function uploadStageMutation(params: {
  stage: TakeRecoveryUploadStage;
  takeId: string;
  claimant: string;
  now: number;
}): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    const claim = assertOwnClaim(current, params.claimant);
    if (
      current.upload &&
      params.stage !== "SESSION_CREATED" &&
      current.upload.takeId !== params.takeId
    ) {
      throw new TakeRecoveryStoreError("INCONSISTENT");
    }
    return {
      ...current,
      upload: { stage: params.stage, takeId: params.takeId },
      claim: extendClaim(claim, params.now),
    };
  };
}

export function clearUploadMutation(claimant: string): TakeRecoveryMutation {
  return (current) => {
    if (!current) throw new TakeRecoveryStoreError("NOT_FOUND");
    assertOwnClaim(current, claimant);
    return { ...current, upload: null };
  };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type TakeRecoveryClassification =
  | { kind: "RECOVERABLE"; partial: boolean; approxSeconds: number }
  | { kind: "SAVED"; takeId: string }
  | { kind: "LIVE" }
  | { kind: "BUSY" }
  | { kind: "EXPIRED" }
  | { kind: "LIMIT_EXCEEDED" }
  | { kind: "CORRUPT"; reason: string };

/**
 * `chunkSizes` = sizes of the stored chunks; null skips the deep check
 * (listing). Recovery always runs the deep check before uploading.
 */
export function classifyTakeRecoveryRecord(
  record: TakeRecoveryRecord,
  params: { now: number; claimant: string; chunkSizes: number[] | null },
): TakeRecoveryClassification {
  const { now } = params;
  if (now - record.startedAt > TAKE_LOCAL_RECOVERY_TTL_SECONDS * 1000) {
    return { kind: "EXPIRED" };
  }
  if (record.formatVersion !== TAKE_RECOVERY_FORMAT_VERSION) {
    return { kind: "CORRUPT", reason: "FORMAT_VERSION" };
  }
  if (record.upload?.stage === "FINALIZED") {
    return { kind: "SAVED", takeId: record.upload.takeId };
  }
  if (isLiveRecording(record, now)) return { kind: "LIVE" };
  if (claimHeldByOther(record, params.claimant, now)) return { kind: "BUSY" };
  if (!validScope(record)) {
    return { kind: "CORRUPT", reason: "SCOPE" };
  }
  if (!normalizeTakeContentType(record.mimeType)) {
    return { kind: "CORRUPT", reason: "MIME" };
  }
  if (record.chunkCount < 1 || record.byteSize < 1) {
    return { kind: "CORRUPT", reason: "EMPTY" };
  }
  if (params.chunkSizes) {
    const sum = params.chunkSizes.reduce((acc, size) => acc + size, 0);
    if (
      params.chunkSizes.length !== record.chunkCount ||
      sum !== record.byteSize
    ) {
      return { kind: "CORRUPT", reason: "CHUNKS" };
    }
  }
  if (
    !Number.isFinite(record.maxRecordingSeconds) ||
    record.maxRecordingSeconds < 1 ||
    record.maxRecordingSeconds > RECORDING_GLOBAL_MAX_SECONDS
  ) {
    return { kind: "CORRUPT", reason: "LIMIT_FIELD" };
  }
  const elapsedMs = Math.max(0, record.updatedAt - record.startedAt);
  if (
    record.byteSize > TAKE_AUDIO_MAX_BYTES ||
    elapsedMs >
      record.maxRecordingSeconds * 1000 + TAKE_RECOVERY_DURATION_SLACK_MS
  ) {
    return { kind: "LIMIT_EXCEEDED" };
  }
  return {
    kind: "RECOVERABLE",
    partial: record.status !== "COMPLETE",
    approxSeconds: Math.max(1, Math.round(elapsedMs / 1000)),
  };
}

// ---------------------------------------------------------------------------
// Lease keeper — bounded renewal while an upload/recovery runs
// ---------------------------------------------------------------------------

export type TakeRecoveryLeaseKeeper = {
  readonly lost: boolean;
  stop(): void;
};

/**
 * Renews the caller's lease every `TAKE_RECOVERY_CLAIM_RENEW_MS` (one timer at
 * a time). Stops on `stop()`, on loss (another owner / copy removed) and once
 * the max hold time is reached — the lease then lapses on its own.
 */
export function startTakeRecoveryLeaseKeeper(params: {
  store: TakeRecoveryStore;
  recoveryId: string;
  claimant: string;
  now: () => number;
  onLost?: () => void;
}): TakeRecoveryLeaseKeeper {
  const startedAt = params.now();
  let stopped = false;
  let lost = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const halt = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const tick = async () => {
    timer = null;
    if (stopped) return;
    if (params.now() - startedAt >= TAKE_RECOVERY_CLAIM_MAX_HOLD_MS) {
      halt();
      return;
    }
    try {
      await params.store.transact(
        params.recoveryId,
        renewClaimMutation(params.claimant, params.now()),
      );
    } catch (error) {
      if (stopped) return;
      if (isLeaseLoss(error)) {
        lost = true;
        halt();
        params.onLost?.();
        return;
      }
      // Transient storage error: the next tick retries (bounded by max hold).
    }
    if (!stopped) timer = setTimeout(() => void tick(), TAKE_RECOVERY_CLAIM_RENEW_MS);
  };

  timer = setTimeout(() => void tick(), TAKE_RECOVERY_CLAIM_RENEW_MS);
  return {
    get lost() {
      return lost;
    },
    stop: halt,
  };
}

// ---------------------------------------------------------------------------
// Writer — used by the recording panels while capturing
// ---------------------------------------------------------------------------

export type TakeRecoveryWriterState = "SECURING" | "SECURED" | "UNAVAILABLE";

export type TakeRecoveryWriter = {
  readonly recoveryId: string;
  readonly state: TakeRecoveryWriterState;
  append(chunk: Blob): void;
  /** Never rejects; resolves false on failure or timeout (UI must not hang). */
  finish(status: "COMPLETE" | "INTERRUPTED", timeoutMs: number): Promise<boolean>;
  /**
   * Records a server stage. Rejects with {@link TakeRecoveryLeaseLostError}
   * when another tab owns or removed the copy (aborts finalize); local storage
   * failures are swallowed so the in-memory upload still proceeds.
   */
  noteStage(stage: "SESSION_CREATED" | "BINARY_UPLOADED", takeId: string): Promise<void>;
  /** Deletes the local copy only if it belongs to `takeId` and the lease is ours. */
  confirmSaved(takeId: string): Promise<boolean>;
  /** Upload failed — keep the copy and let any tab recover it. */
  release(): Promise<void>;
  /** User discarded the recording. */
  discard(): Promise<void>;
};

export function createTakeRecoveryWriter(params: {
  store: TakeRecoveryStore | null;
  recoveryId: string;
  claimant: string;
  surface: TakeRecoverySurface;
  projectId: string | null;
  ownerUserId: string | null;
  beatId: string;
  mimeType: string;
  maxRecordingSeconds: number;
  now?: () => number;
  onStateChange?: (state: TakeRecoveryWriterState) => void;
}): TakeRecoveryWriter {
  const now = params.now ?? (() => Date.now());
  const store = params.store;
  let state: TakeRecoveryWriterState = store ? "SECURING" : "UNAVAILABLE";
  let queue: Promise<unknown> = Promise.resolve();
  let nextSeq = 0;
  let sealed = false;
  let keeper: TakeRecoveryLeaseKeeper | null = null;

  const setState = (next: TakeRecoveryWriterState) => {
    if (state === next) return;
    state = next;
    params.onStateChange?.(next);
  };

  const stopKeeper = () => {
    keeper?.stop();
  };

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const fail = () => {
    if (state === "UNAVAILABLE") return;
    setState("UNAVAILABLE");
    stopKeeper();
    if (store) {
      void enqueue(() => store.remove(params.recoveryId)).catch(() => undefined);
    }
  };

  if (store) {
    void enqueue(() =>
      store.transact(
        params.recoveryId,
        createRecoveryRecordMutation({
          recoveryId: params.recoveryId,
          surface: params.surface,
          projectId: params.projectId,
          ownerUserId: params.ownerUserId,
          beatId: params.beatId,
          mimeType: params.mimeType,
          maxRecordingSeconds: params.maxRecordingSeconds,
          now: now(),
        }),
      ),
    ).catch(fail);
  }

  return {
    recoveryId: params.recoveryId,
    get state() {
      return state;
    },
    append(chunk) {
      if (!store || state === "UNAVAILABLE" || sealed) return;
      const seq = nextSeq++;
      void enqueue(async () => {
        if (state === "UNAVAILABLE") return;
        await store.transact(
          params.recoveryId,
          appendChunkMutation(seq, chunk.size, now()),
          { seq, blob: chunk },
        );
      }).catch(fail);
    },
    finish(status, timeoutMs) {
      if (!store || state === "UNAVAILABLE" || sealed) {
        return Promise.resolve(false);
      }
      sealed = true;
      const expected = nextSeq;
      const work = enqueue(async () => {
        if (state === "UNAVAILABLE") return false;
        await store.transact(
          params.recoveryId,
          finishRecordingMutation({
            status,
            expectedChunkCount: status === "COMPLETE" ? expected : null,
            claimant: params.claimant,
            now: now(),
          }),
        );
        setState("SECURED");
        if (status === "COMPLETE") {
          keeper = startTakeRecoveryLeaseKeeper({
            store,
            recoveryId: params.recoveryId,
            claimant: params.claimant,
            now,
          });
        }
        return true;
      }).catch(() => {
        fail();
        return false;
      });
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        void work.then((ok) => {
          clearTimeout(timer);
          resolve(ok);
        });
      });
    },
    async noteStage(stage, takeId) {
      if (!store) return;
      await enqueue(async () => {
        if (state !== "SECURED") return;
        if (keeper?.lost) throw new TakeRecoveryLeaseLostError();
        try {
          await store.transact(
            params.recoveryId,
            uploadStageMutation({
              stage,
              takeId,
              claimant: params.claimant,
              now: now(),
            }),
          );
        } catch (error) {
          if (isLeaseLoss(error)) {
            stopKeeper();
            throw new TakeRecoveryLeaseLostError();
          }
        }
      });
    },
    async confirmSaved(takeId) {
      if (!store) return false;
      return enqueue(async () => {
        stopKeeper();
        if (state !== "SECURED") return false;
        await store.transact(
          params.recoveryId,
          uploadStageMutation({
            stage: "FINALIZED",
            takeId,
            claimant: params.claimant,
            now: now(),
          }),
        );
        await store.remove(params.recoveryId);
        return true;
      }).catch(() => false);
    },
    async release() {
      if (!store) return;
      await enqueue(async () => {
        stopKeeper();
        if (state !== "SECURED") return;
        await store.transact(
          params.recoveryId,
          releaseClaimMutation(params.claimant),
        );
      }).catch(() => undefined);
    },
    async discard() {
      sealed = true;
      stopKeeper();
      if (!store) return;
      setState("UNAVAILABLE");
      await enqueue(() => store.remove(params.recoveryId)).catch(() => undefined);
    },
  };
}

/**
 * Chunks arrive from `recorder.start({ onChunk })` before the writer exists
 * (its record needs the negotiated MIME type); they are buffered in order.
 */
export function createTakeRecoveryChunkBuffer(): {
  onChunk: (chunk: Blob) => void;
  attach: (writer: TakeRecoveryWriter) => void;
} {
  let writer: TakeRecoveryWriter | null = null;
  const early: Blob[] = [];
  return {
    onChunk(chunk) {
      if (writer) writer.append(chunk);
      else early.push(chunk);
    },
    attach(next) {
      writer = next;
      for (const chunk of early.splice(0)) next.append(chunk);
    },
  };
}

// ---------------------------------------------------------------------------
// Recovery / discard / listing — used by the recovery banner
// ---------------------------------------------------------------------------

export type TakeRecoveryUploadFn = (params: {
  beatId: string;
  blob: Blob;
  contentType: string;
  anonymous: boolean;
  onStage: (stage: {
    stage: "SESSION_CREATED" | "BINARY_UPLOADED";
    takeId: string;
  }) => Promise<void>;
}) => Promise<{ takeId: string }>;

export type TakeRecoveryViewerDeps = {
  store: TakeRecoveryStore;
  claimant: string;
  now: () => number;
  /** Signed-in account of this page; null = guest. Copies of others stay hidden. */
  viewerUserId: string | null;
};

export type TakeRecoveryDeps = TakeRecoveryViewerDeps & {
  upload: TakeRecoveryUploadFn;
  finalize: (
    takeId: string,
    options: { anonymous: boolean },
  ) => Promise<{ takeId: string }>;
};

export type TakeRecoveryOutcome =
  | { kind: "SAVED"; takeId: string; alreadySaved: boolean; localCopyRemoved: boolean }
  | { kind: "BUSY" }
  | { kind: "NOT_FOUND" }
  | { kind: "EXPIRED" }
  | { kind: "CORRUPT"; reason: string }
  | { kind: "LIMIT_EXCEEDED" }
  | { kind: "IDENTITY_MISMATCH" }
  | { kind: "OWNER_MISMATCH" }
  | { kind: "LEASE_LOST" }
  | { kind: "UPLOAD_FAILED"; message: string; concurrentSession: boolean; dailyLimit: boolean }
  | { kind: "STORAGE_UNAVAILABLE" };

function rawErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "rawMessage" in error) {
    return String((error as { rawMessage: unknown }).rawMessage);
  }
  return error instanceof Error ? error.message : String(error);
}

/** Polish UI text for a failed upload / finalize — never raw browser or API English. */
function uploadFailureMessage(error: unknown, raw: string): string {
  if (/REPLACE_REQUIRED|ACTIVE_READY_CAP/i.test(raw)) {
    return "Masz pełny limit aktywnych nagrań — usuń lub zastąp jedno z zapisanych nagrań.";
  }
  const shown = error instanceof Error ? error.message : raw;
  if (looksLikePolishUserMessage(shown)) return shown;
  if (/failed to fetch|networkerror|load failed|network/i.test(raw)) {
    return "Brak połączenia z serwerem.";
  }
  return "Nie udało się przesłać nagrania.";
}

function storeErrorOutcome(error: unknown): TakeRecoveryOutcome {
  if (error instanceof TakeRecoveryStoreError) {
    if (error.code === "BUSY") return { kind: "BUSY" };
    if (error.code === "NOT_FOUND") return { kind: "NOT_FOUND" };
  }
  return { kind: "STORAGE_UNAVAILABLE" };
}

const inFlightRecoveries = new Map<string, Promise<TakeRecoveryOutcome>>();

/** Same-tab double clicks share one run; other tabs are excluded by the claim. */
export function recoverTakeRecording(
  deps: TakeRecoveryDeps,
  recoveryId: string,
): Promise<TakeRecoveryOutcome> {
  const existing = inFlightRecoveries.get(recoveryId);
  if (existing) return existing;
  const run = runRecovery(deps, recoveryId).finally(() => {
    inFlightRecoveries.delete(recoveryId);
  });
  inFlightRecoveries.set(recoveryId, run);
  return run;
}

async function runRecovery(
  deps: TakeRecoveryDeps,
  recoveryId: string,
): Promise<TakeRecoveryOutcome> {
  const { store, claimant } = deps;
  let record: TakeRecoveryRecord;
  try {
    record = await store.transact(recoveryId, claimMutation(claimant, deps.now()));
  } catch (error) {
    return storeErrorOutcome(error);
  }

  const release = () =>
    store
      .transact(recoveryId, releaseClaimMutation(claimant))
      .then(() => undefined)
      .catch(() => undefined);

  if (record.ownerUserId !== deps.viewerUserId) {
    await release();
    return { kind: "OWNER_MISMATCH" };
  }

  const keeper = startTakeRecoveryLeaseKeeper({
    store,
    recoveryId,
    claimant,
    now: deps.now,
  });
  try {
    return await recoverClaimed(deps, record, release);
  } finally {
    keeper.stop();
  }
}

async function recoverClaimed(
  deps: TakeRecoveryDeps,
  record: TakeRecoveryRecord,
  release: () => Promise<void>,
): Promise<TakeRecoveryOutcome> {
  const { store, claimant } = deps;
  const recoveryId = record.recoveryId;
  const anonymous = record.ownerUserId === null;

  /** SAVED is server truth; the local copy is only removed while we own it. */
  const savedOutcome = async (
    takeId: string,
    alreadySaved: boolean,
  ): Promise<TakeRecoveryOutcome> => {
    let localCopyRemoved = false;
    try {
      await store.transact(
        recoveryId,
        uploadStageMutation({ stage: "FINALIZED", takeId, claimant, now: deps.now() }),
      );
      await store.remove(recoveryId);
      localCopyRemoved = true;
    } catch {
      localCopyRemoved = false;
    }
    return { kind: "SAVED", takeId, alreadySaved, localCopyRemoved };
  };

  const shallow = classifyTakeRecoveryRecord(record, {
    now: deps.now(),
    claimant,
    chunkSizes: null,
  });
  if (shallow.kind === "EXPIRED") {
    await store.remove(recoveryId).catch(() => undefined);
    return { kind: "EXPIRED" };
  }
  if (shallow.kind === "SAVED") {
    await store.remove(recoveryId).catch(() => undefined);
    return {
      kind: "SAVED",
      takeId: shallow.takeId,
      alreadySaved: true,
      localCopyRemoved: true,
    };
  }

  let chunks: Blob[];
  try {
    chunks = await store.readChunks(recoveryId);
  } catch {
    await release();
    return { kind: "STORAGE_UNAVAILABLE" };
  }
  const deep = classifyTakeRecoveryRecord(record, {
    now: deps.now(),
    claimant,
    chunkSizes: chunks.map((chunk) => chunk.size),
  });
  if (deep.kind === "CORRUPT" || deep.kind === "LIMIT_EXCEEDED") {
    await release();
    return deep;
  }
  if (deep.kind !== "RECOVERABLE") {
    await release();
    return { kind: "BUSY" };
  }

  if (record.upload) {
    // Finalize is idempotent for READY takes, so a known server take is
    // always confirmed before a new session could create a duplicate.
    const expectedTakeId = record.upload.takeId;
    const deadSession =
      record.upload.stage === "BINARY_UPLOADED"
        ? /Take session expired|not awaiting finalize/i
        : /Take session expired|not awaiting finalize|audio object missing/i;
    try {
      await store.transact(recoveryId, renewClaimMutation(claimant, deps.now()));
    } catch (error) {
      if (isLeaseLoss(error)) return { kind: "LEASE_LOST" };
      await release();
      return storeErrorOutcome(error);
    }
    try {
      const result = await deps.finalize(expectedTakeId, { anonymous });
      if (result.takeId !== expectedTakeId) {
        await release();
        return { kind: "IDENTITY_MISMATCH" };
      }
      return savedOutcome(expectedTakeId, false);
    } catch (error) {
      const raw = rawErrorMessage(error);
      if (!deadSession.test(raw)) {
        await release();
        return {
          kind: "UPLOAD_FAILED",
          message: uploadFailureMessage(error, raw),
          concurrentSession: false,
          dailyLimit: false,
        };
      }
      // The old server session is dead — fall through to a fresh upload.
      try {
        await store.transact(recoveryId, clearUploadMutation(claimant));
      } catch (storeError) {
        if (isLeaseLoss(storeError)) return { kind: "LEASE_LOST" };
        await release();
        return storeErrorOutcome(storeError);
      }
    }
  }

  let sessionTakeId: string | null = null;
  try {
    const result = await deps.upload({
      beatId: record.beatId,
      blob: new Blob(chunks, { type: record.mimeType }),
      contentType: normalizeTakeContentType(record.mimeType) ?? record.mimeType,
      anonymous,
      onStage: async ({ stage, takeId }) => {
        sessionTakeId = takeId;
        await store.transact(
          recoveryId,
          uploadStageMutation({ stage, takeId, claimant, now: deps.now() }),
        );
      },
    });
    if (!sessionTakeId || result.takeId !== sessionTakeId) {
      await release();
      return { kind: "IDENTITY_MISMATCH" };
    }
    return savedOutcome(result.takeId, false);
  } catch (error) {
    if (isLeaseLoss(error)) return { kind: "LEASE_LOST" };
    await release();
    const raw = rawErrorMessage(error);
    return {
      kind: "UPLOAD_FAILED",
      message: uploadFailureMessage(error, raw),
      concurrentSession: /CONCURRENT_SESSION/i.test(raw),
      dailyLimit: /SESSION_DAY_CAP|Daily recording session limit/i.test(raw),
    };
  }
}

export async function discardTakeRecording(
  deps: TakeRecoveryViewerDeps,
  recoveryId: string,
): Promise<"DISCARDED" | "BUSY" | "NOT_FOUND" | "STORAGE_UNAVAILABLE"> {
  try {
    const record = await deps.store.transact(
      recoveryId,
      claimMutation(deps.claimant, deps.now()),
    );
    if (record.ownerUserId !== deps.viewerUserId) {
      await deps.store
        .transact(recoveryId, releaseClaimMutation(deps.claimant))
        .catch(() => undefined);
      return "NOT_FOUND";
    }
    await deps.store.remove(recoveryId);
    return "DISCARDED";
  } catch (error) {
    const outcome = storeErrorOutcome(error);
    if (outcome.kind === "BUSY" || outcome.kind === "NOT_FOUND") {
      return outcome.kind;
    }
    return "STORAGE_UNAVAILABLE";
  }
}

export type TakeRecoveryScope =
  | { surface: "STUDIO"; projectId: string }
  | { surface: "QUICK_TAKE"; beatId: string };

export type TakeRecoveryListItem = {
  record: TakeRecoveryRecord;
  classification: TakeRecoveryClassification;
};

function inScope(record: TakeRecoveryRecord, scope: TakeRecoveryScope): boolean {
  if (record.surface !== scope.surface) return false;
  return scope.surface === "STUDIO"
    ? record.projectId === scope.projectId
    : record.beatId === scope.beatId;
}

/**
 * Lists this viewer's local copies for one surface (Studio project or Quick
 * Take beat) and deletes copies that are expired or already confirmed as
 * saved (any scope, any owner). `recheckInMs` is set when a hidden copy (live
 * capture, own lease) or another tab's lease will lapse — e.g. right after a
 * reload the dead page's copy still looks live.
 */
export async function listTakeRecoveries(
  deps: TakeRecoveryViewerDeps,
  scope: TakeRecoveryScope,
): Promise<{ items: TakeRecoveryListItem[]; recheckInMs: number | null }> {
  const records = await deps.store.list();
  const items: TakeRecoveryListItem[] = [];
  const now = deps.now();
  let recheckAt: number | null = null;
  const recheck = (at: number) => {
    recheckAt = recheckAt == null ? at : Math.min(recheckAt, at);
  };
  for (const record of records) {
    const classification = classifyTakeRecoveryRecord(record, {
      now,
      claimant: deps.claimant,
      chunkSizes: null,
    });
    if (classification.kind === "EXPIRED" || classification.kind === "SAVED") {
      await deps.store.remove(record.recoveryId).catch(() => undefined);
      continue;
    }
    if (classification.kind === "CORRUPT" && classification.reason === "FORMAT_VERSION") {
      // Unknown format: its scope/owner cannot be trusted — only the TTL purge removes it.
      continue;
    }
    if (!inScope(record, scope) || record.ownerUserId !== deps.viewerUserId) {
      continue;
    }
    if (classification.kind === "LIVE") {
      recheck(record.updatedAt + TAKE_RECOVERY_LIVE_STALE_MS);
      continue;
    }
    if (record.claim && record.claim.expiresAt > now) {
      recheck(record.claim.expiresAt);
      if (record.claim.owner === deps.claimant) continue;
    }
    items.push({ record, classification });
  }
  return {
    items: items.sort((a, b) => b.record.startedAt - a.record.startedAt),
    recheckInMs: recheckAt == null ? null : Math.max(0, recheckAt - now) + 250,
  };
}

// ---------------------------------------------------------------------------
// Copy (Polish UI)
// ---------------------------------------------------------------------------

export function takeRecoveryWriterStatusPl(
  state: TakeRecoveryWriterState,
): string {
  if (state === "UNAVAILABLE") {
    return "Lokalne zabezpieczenie niedostępne — nagranie istnieje tylko w tej karcie. Nie zamykaj strony do potwierdzenia zapisu.";
  }
  if (state === "SECURING") {
    return "Aktywne nagrywanie — trwa zabezpieczanie nagrania w tej przeglądarce (jeszcze niepotwierdzone).";
  }
  return "Aktywne nagrywanie — nagranie jest na bieżąco zabezpieczane lokalnie w tej przeglądarce.";
}

export function takeRecoveryItemSummaryPl(item: TakeRecoveryListItem): string {
  const c = item.classification;
  if (c.kind === "RECOVERABLE") {
    if (item.record.upload?.stage === "BINARY_UPLOADED") {
      return "Nagranie zostało przesłane, ale zapis nie został potwierdzony. Wymaga dokończenia zapisu.";
    }
    return c.partial
      ? `Nagrywanie zostało przerwane. Zabezpieczono lokalnie fragment (ok. ${c.approxSeconds} s) — wymaga odzyskania.`
      : `Nagranie (ok. ${c.approxSeconds} s) jest zabezpieczone lokalnie, ale nie zostało zapisane na serwerze — wymaga odzyskania.`;
  }
  if (c.kind === "BUSY") return "To nagranie jest właśnie obsługiwane w innej karcie.";
  if (c.kind === "LIMIT_EXCEEDED") {
    return "Odzyskanie niemożliwe — lokalna kopia przekracza limit nagrania. Możesz ją tylko odrzucić.";
  }
  if (c.kind === "CORRUPT") {
    return "Odzyskanie niemożliwe — lokalna kopia jest uszkodzona lub w nieobsługiwanym formacie. Możesz ją tylko odrzucić.";
  }
  return "Lokalna kopia nagrania.";
}

export function takeRecoveryOutcomePl(
  outcome: TakeRecoveryOutcome,
  surface: TakeRecoverySurface = "STUDIO",
): string {
  switch (outcome.kind) {
    case "SAVED": {
      const where =
        surface === "STUDIO"
          ? "Zapis potwierdzony — nagranie jest w „Moje Take'i”."
          : "Zapis potwierdzony — nagranie zostało zapisane na serwerze.";
      return outcome.localCopyRemoved
        ? `${where} Lokalna kopia została usunięta.`
        : `${where} Lokalną kopię usunie karta, która ją obecnie obsługuje.`;
    }
    case "BUSY":
      return "To nagranie jest właśnie obsługiwane w innej karcie.";
    case "NOT_FOUND":
      return "Lokalna kopia nagrania już nie istnieje.";
    case "EXPIRED":
      return "Lokalna kopia nagrania wygasła i została usunięta.";
    case "CORRUPT":
      return "Odzyskanie niemożliwe — lokalna kopia jest uszkodzona lub niekompletna. Możesz ją tylko odrzucić.";
    case "LIMIT_EXCEEDED":
      return "Odzyskanie niemożliwe — lokalna kopia przekracza limit nagrania. Możesz ją tylko odrzucić.";
    case "IDENTITY_MISMATCH":
      return "Odzyskanie przerwane — serwer potwierdził inne nagranie niż oczekiwane. Lokalna kopia została zachowana.";
    case "OWNER_MISMATCH":
      return "Ta lokalna kopia należy do innego konta lub do sesji gościa. Zaloguj się na właściwe konto, aby ją odzyskać.";
    case "LEASE_LOST":
      return "Odzyskanie przerwane — to nagranie przejęła inna karta. Lokalna kopia nie została usunięta.";
    case "UPLOAD_FAILED":
      if (outcome.dailyLimit) {
        return `Dzienny limit sesji nagrań jest wykorzystany — nagranie nie zostało zapisane. Lokalna kopia została zachowana; możesz spróbować po odnowieniu limitu (kopia jest przechowywana do ${TAKE_LOCAL_RECOVERY_TTL_SECONDS / 3600} h od nagrania) albo ją odrzucić.`;
      }
      return outcome.concurrentSession
        ? `Błąd zapisu — na Twoim koncie trwa inna sesja nagrania (np. niedokończony zapis w innej karcie). Lokalna kopia została zachowana. Niedokończona rezerwacja bez przesłanego pliku przestaje blokować zapis po ${TAKE_PENDING_UPLOAD_WINDOW_SECONDS / 60} min od jej rozpoczęcia — spróbuj ponownie później.`
        : `Błąd zapisu: ${outcome.message} Lokalna kopia została zachowana — ${
            /połączenia/.test(outcome.message)
              ? "spróbuj ponownie po odzyskaniu połączenia."
              : "spróbuj ponownie."
          }`;
    case "STORAGE_UNAVAILABLE":
      return "Pamięć przeglądarki jest niedostępna — nie można odczytać lokalnej kopii nagrania.";
  }
}
