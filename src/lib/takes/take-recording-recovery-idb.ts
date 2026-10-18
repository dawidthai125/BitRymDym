/**
 * STU-14 — IndexedDB adapter for {@link TakeRecoveryStore}. Browser only.
 * Every operation is a single readwrite transaction; IndexedDB serialises
 * overlapping readwrite transactions across tabs, which makes claims atomic.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  TakeRecoveryStoreError,
  type TakeRecoveryMutation,
  type TakeRecoveryRecord,
  type TakeRecoveryStore,
} from "@/lib/takes/take-recording-recovery";

const DB_NAME = "brd-take-recovery";
const DB_VERSION = 1;
const RECORDS = "records";
const CHUNKS = "chunks";
const OPEN_TIMEOUT_MS = 3_000;

type StoredChunk = {
  recoveryId: string;
  seq: number;
  type: string;
  data: ArrayBuffer;
};

function mapError(error: unknown): TakeRecoveryStoreError {
  if (error instanceof TakeRecoveryStoreError) return error;
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  return new TakeRecoveryStoreError(
    name === "QuotaExceededError" ? "QUOTA" : "UNAVAILABLE",
  );
}

function chunkRange(recoveryId: string): IDBKeyRange {
  return IDBKeyRange.bound([recoveryId, 0], [recoveryId, Number.MAX_SAFE_INTEGER]);
}

function openDb(factory: IDBFactory, onLost: () => void): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => settle(null), OPEN_TIMEOUT_MS);
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch {
      settle(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) {
        db.createObjectStore(RECORDS, { keyPath: "recoveryId" });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        db.createObjectStore(CHUNKS, { keyPath: ["recoveryId", "seq"] });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab deleting / upgrading the database, or the browser clearing
      // site data, ends this connection; the next operation opens a new one.
      db.onversionchange = () => {
        db.close();
        onLost();
      };
      db.onclose = onLost;
      settle(db);
    };
    request.onerror = () => settle(null);
    request.onblocked = () => settle(null);
  });
}

function isClosedConnection(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: unknown }).name === "InvalidStateError"
  );
}

function createIdbStore(factory: IDBFactory): {
  store: TakeRecoveryStore;
  connect: () => Promise<IDBDatabase | null>;
} {
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const connect = (): Promise<IDBDatabase | null> => {
    if (!dbPromise) {
      const opening: Promise<IDBDatabase | null> = openDb(factory, () => {
        if (dbPromise === opening) dbPromise = null;
      });
      dbPromise = opening;
      void opening.then((db) => {
        if (!db && dbPromise === opening) dbPromise = null;
      });
    }
    return dbPromise;
  };

  const run = async <T>(
    mode: IDBTransactionMode,
    body: (tx: IDBTransaction, fail: (error: unknown) => void) => () => T,
  ): Promise<T> => {
    let tx: IDBTransaction | null = null;
    for (let attempt = 0; attempt < 2 && !tx; attempt += 1) {
      const db = await connect();
      if (!db) throw new TakeRecoveryStoreError("UNAVAILABLE");
      try {
        tx = db.transaction([RECORDS, CHUNKS], mode);
      } catch (error) {
        // Closed without an event (e.g. the browser dropped it): reopen once.
        if (!isClosedConnection(error) || attempt > 0) throw mapError(error);
        dbPromise = null;
      }
    }
    return runTransaction(tx!, body);
  };

  const runTransaction = <T>(
    tx: IDBTransaction,
    body: (tx: IDBTransaction, fail: (error: unknown) => void) => () => T,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let failure: unknown = null;
      const fail = (error: unknown) => {
        if (failure == null) failure = error;
        try {
          tx.abort();
        } catch {
          // already finished
        }
      };
      const result = body(tx, fail);
      tx.oncomplete = () => resolve(result());
      tx.onabort = () => reject(mapError(failure ?? tx.error));
      tx.onerror = () => {
        if (failure == null) failure = tx.error;
      };
    });

  const store: TakeRecoveryStore = {
    async transact(recoveryId, mutate: TakeRecoveryMutation, chunk) {
      const chunkData = chunk ? await chunk.blob.arrayBuffer() : null;
      return run<TakeRecoveryRecord>("readwrite", (tx, fail) => {
        let next: TakeRecoveryRecord | null = null;
        const records = tx.objectStore(RECORDS);
        const get = records.get(recoveryId);
        get.onsuccess = () => {
          try {
            next = mutate((get.result as TakeRecoveryRecord | undefined) ?? null);
          } catch (error) {
            fail(error);
            return;
          }
          records.put(next);
          if (chunk && chunkData) {
            const stored: StoredChunk = {
              recoveryId,
              seq: chunk.seq,
              type: chunk.blob.type,
              data: chunkData,
            };
            tx.objectStore(CHUNKS).put(stored);
          }
        };
        return () => next as TakeRecoveryRecord;
      });
    },
    list() {
      return run<TakeRecoveryRecord[]>("readonly", (tx) => {
        const request = tx.objectStore(RECORDS).getAll();
        return () => (request.result as TakeRecoveryRecord[]) ?? [];
      });
    },
    readChunks(recoveryId) {
      return run<Blob[]>("readonly", (tx) => {
        const request = tx.objectStore(CHUNKS).getAll(chunkRange(recoveryId));
        return () =>
          ((request.result as StoredChunk[]) ?? [])
            .sort((a, b) => a.seq - b.seq)
            .map((row) => new Blob([row.data], { type: row.type }));
      });
    },
    remove(recoveryId) {
      return run<void>("readwrite", (tx) => {
        tx.objectStore(RECORDS).delete(recoveryId);
        tx.objectStore(CHUNKS).delete(chunkRange(recoveryId));
        return () => undefined;
      });
    },
  };
  return { store, connect };
}

/** Null when the first open fails (blocked, private mode, timeout). */
export async function createTakeRecoveryIdbStore(
  factory: IDBFactory,
): Promise<TakeRecoveryStore | null> {
  const { store, connect } = createIdbStore(factory);
  return (await connect()) ? store : null;
}

let storePromise: Promise<TakeRecoveryStore | null> | null = null;

/** Null when IndexedDB is missing, blocked or fails to open (e.g. private mode). */
export function getBrowserTakeRecoveryStore(): Promise<TakeRecoveryStore | null> {
  let factory: IDBFactory | undefined;
  try {
    factory = typeof indexedDB === "undefined" ? undefined : indexedDB;
  } catch {
    factory = undefined;
  }
  if (!factory) return Promise.resolve(null);
  if (!storePromise) {
    storePromise = createTakeRecoveryIdbStore(factory);
    void storePromise.then((store) => {
      if (!store) storePromise = null;
    });
  }
  return storePromise;
}

/**
 * Account bound to local copies made on this page: the user id from the local
 * Supabase session (no network, no token is stored). Guests resolve to null.
 * `undefined` = signed in but the id could not be read — callers then keep no
 * local copy and show none, because ownership cannot be verified.
 */
export async function getTakeRecoveryViewerUserId(
  authenticated: boolean,
): Promise<string | null | undefined> {
  if (!authenticated) return null;
  try {
    const { data } = await createSupabaseBrowserClient().auth.getSession();
    const userId = data.session?.user?.id;
    return typeof userId === "string" && userId.length > 0 ? userId : undefined;
  } catch {
    return undefined;
  }
}

let tabClaimant: string | null = null;

/** Per-tab owner id for recovery leases (not an identity of the take). */
export function getTakeRecoveryTabClaimant(): string {
  if (!tabClaimant) {
    tabClaimant =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return tabClaimant;
}
