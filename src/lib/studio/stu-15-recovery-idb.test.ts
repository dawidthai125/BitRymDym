/**
 * STU-15 — IndexedDB adapter survives a lost connection (another tab deleting
 * the database, site data cleared, browser closing the connection) instead of
 * reporting "local safety unavailable" until the page is reloaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TakeRecoveryStoreError,
  type TakeRecoveryMutation,
  type TakeRecoveryRecord,
} from "@/lib/takes/take-recording-recovery";
import { createTakeRecoveryIdbStore } from "@/lib/takes/take-recording-recovery-idb";

type Handler = ((event?: unknown) => void) | null;
const later = (fn: () => void) => setTimeout(fn, 0);

class FakeRequest {
  result: unknown = undefined;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
}

type Data = { records: Map<string, unknown>; chunks: Map<string, { recoveryId: string; seq: number }> };

class FakeTx {
  oncomplete: Handler = null;
  onabort: Handler = null;
  onerror: Handler = null;
  error: unknown = null;
  private pending = 0;
  private aborted = false;
  constructor(private data: Data) {}
  private op(run: () => unknown): FakeRequest {
    const request = new FakeRequest();
    this.pending += 1;
    later(() => {
      if (this.aborted) return;
      request.result = run();
      request.onsuccess?.();
      this.pending -= 1;
      if (this.pending === 0) later(() => !this.aborted && this.oncomplete?.());
    });
    return request;
  }
  abort() {
    this.aborted = true;
    later(() => this.onabort?.());
  }
  objectStore(name: string) {
    const { records, chunks } = this.data;
    const inRange = (key: unknown, range: unknown) =>
      (range as { lower: [string] }).lower[0] === (key as { recoveryId: string }).recoveryId;
    if (name === "records") {
      return {
        get: (id: string) => this.op(() => records.get(id)),
        put: (row: { recoveryId: string }) => this.op(() => records.set(row.recoveryId, row)),
        getAll: () => this.op(() => [...records.values()]),
        delete: (id: string) => this.op(() => records.delete(id)),
      };
    }
    return {
      put: (row: { recoveryId: string; seq: number }) =>
        this.op(() => chunks.set(`${row.recoveryId}:${row.seq}`, row)),
      getAll: (range: unknown) =>
        this.op(() => [...chunks.values()].filter((row) => inRange(row, range))),
      delete: (range: unknown) =>
        this.op(() => {
          for (const [key, row] of chunks) if (inRange(row, range)) chunks.delete(key);
        }),
    };
  }
}

class FakeDb {
  closed = false;
  onversionchange: Handler = null;
  onclose: Handler = null;
  objectStoreNames = { contains: () => true };
  constructor(private data: Data) {}
  createObjectStore() {}
  close() {
    this.closed = true;
  }
  transaction() {
    if (this.closed) {
      throw Object.assign(new Error("The database connection is closing."), {
        name: "InvalidStateError",
      });
    }
    return new FakeTx(this.data);
  }
}

class FakeFactory {
  opens = 0;
  failOpen = false;
  data: Data = { records: new Map(), chunks: new Map() };
  connections: FakeDb[] = [];
  open() {
    const request = new FakeRequest();
    later(() => {
      if (this.failOpen) {
        request.onerror?.();
        return;
      }
      this.opens += 1;
      const db = new FakeDb(this.data);
      this.connections.push(db);
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
  /** What another tab's indexedDB.deleteDatabase() does to open connections. */
  deleteFromAnotherTab() {
    for (const db of this.connections) db.onversionchange?.();
    this.data = { records: new Map(), chunks: new Map() };
  }
}

const put =
  (id: string, note: string): TakeRecoveryMutation =>
  () =>
    ({ recoveryId: id, note }) as unknown as TakeRecoveryRecord;

let factory: FakeFactory;

beforeEach(() => {
  factory = new FakeFactory();
  vi.stubGlobal("IDBKeyRange", {
    bound: (lower: unknown, upper: unknown) => ({ lower, upper }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("STU-15 IndexedDB adapter — lost connection", () => {
  it("first open failing (blocked / private mode) reports no store", async () => {
    factory.failOpen = true;
    expect(await createTakeRecoveryIdbStore(factory as unknown as IDBFactory)).toBeNull();
  });

  it("database deleted by another tab: the next write reopens instead of failing until reload", async () => {
    const store = (await createTakeRecoveryIdbStore(factory as unknown as IDBFactory))!;
    await store.transact("a", put("a", "before"));
    expect(factory.opens).toBe(1);

    factory.deleteFromAnotherTab();
    expect(factory.connections[0].closed).toBe(true);

    await store.transact("b", put("b", "after"), { seq: 0, blob: new Blob(["xyz"]) });
    expect(factory.opens).toBe(2);
    expect((await store.list()).map((r) => r.recoveryId)).toEqual(["b"]);
    expect((await store.readChunks("b")).map((blob) => blob.size)).toEqual([3]);
  });

  it("connection closed without an event: one silent reopen, the operation still succeeds", async () => {
    const store = (await createTakeRecoveryIdbStore(factory as unknown as IDBFactory))!;
    factory.connections[0].close();
    await store.transact("c", put("c", "x"));
    expect(factory.opens).toBe(2);
    expect((await store.list()).map((r) => r.recoveryId)).toEqual(["c"]);
  });

  it("browser `close` event drops the cached connection too", async () => {
    const store = (await createTakeRecoveryIdbStore(factory as unknown as IDBFactory))!;
    factory.connections[0].closed = true;
    factory.connections[0].onclose?.();
    await store.list();
    expect(factory.opens).toBe(2);
  });

  it("reopen impossible: honest UNAVAILABLE, and a later operation recovers once IndexedDB works again", async () => {
    const store = (await createTakeRecoveryIdbStore(factory as unknown as IDBFactory))!;
    factory.failOpen = true;
    factory.deleteFromAnotherTab();
    const error = await store.transact("d", put("d", "x")).catch((caught) => caught);
    expect(error).toBeInstanceOf(TakeRecoveryStoreError);
    expect((error as TakeRecoveryStoreError).code).toBe("UNAVAILABLE");

    factory.failOpen = false;
    await store.transact("d", put("d", "x"));
    expect((await store.list()).map((r) => r.recoveryId)).toEqual(["d"]);
  });
});
