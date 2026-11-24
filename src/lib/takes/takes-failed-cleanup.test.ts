/**
 * FAILED-transition guard (never overwrite READY), best-effort object removal on
 * rejected finalize, and janitor sweep of all old FAILED rows with a cursor
 * that advances past the first batch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
const remove = vi.fn();
const list = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc,
    from,
    storage: { from: () => ({ remove, list }) },
  }),
}));

type Call = [string, ...unknown[]];

function query(result: { data: unknown; error: unknown }, calls: Call[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "update", "in", "is", "eq", "not", "lte", "or", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  const p = Promise.resolve(result);
  chain.then = p.then.bind(p);
  return chain;
}

afterEach(() => {
  rpc.mockReset();
  from.mockReset();
  remove.mockReset();
  list.mockReset();
});

const OWNER = "11111111-1111-4111-8111-111111111111";

describe("markPendingTakeFailed", () => {
  it("only transitions PENDING_UPLOAD and removes the object when the row changed", async () => {
    const calls: Call[] = [];
    from.mockImplementation(() => query({ data: [{ id: "t1" }], error: null }, calls));
    remove.mockResolvedValue({ error: null });
    const { markPendingTakeFailed } = await import("@/lib/takes/finalize-swap");
    const ok = await markPendingTakeFailed({
      takeId: "t1",
      failureReason: "INVALID_MIME",
      objectKey: "user/u/t1.bin",
      removeObject: true,
    });
    expect(ok).toBe(true);
    expect(calls).toContainEqual(["eq", "status", "PENDING_UPLOAD"]);
    expect(remove).toHaveBeenCalledWith(["user/u/t1.bin"]);
  });

  it("leaves storage alone when the take was already READY (no row updated)", async () => {
    from.mockImplementation(() => query({ data: [], error: null }, []));
    const { markPendingTakeFailed } = await import("@/lib/takes/finalize-swap");
    const ok = await markPendingTakeFailed({
      takeId: "t1",
      failureReason: "DURATION_EXCEEDED",
      objectKey: "user/u/t1.bin",
      removeObject: true,
    });
    expect(ok).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("takes janitor terminal sweep", () => {
  it("sweeps every old FAILED row and advances a cursor past the first batch", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    remove.mockResolvedValue({ error: null });
    const queries: Call[][] = [];
    const marks: Call[][] = [];
    const row = (id: string, status: string) => ({
      id,
      status,
      object_key: `user/${OWNER}/${id}.bin`,
      storage_bucket: "take-audio",
      deleted_at: null,
      expires_at: "2026-11-01T00:00:00Z",
      updated_at: `2026-11-01T00:00:0${id.slice(-1)}+00:00`,
    });
    const pages = [
      [], // due
      [row("e1", "EXPIRED"), row("e2", "EXPIRED")], // leftovers batch 1 (full)
      [row("e3", "EXPIRED")], // leftovers batch 2 (short → stop)
      [row("f1", "FAILED")], // failed sweep
    ];
    from.mockImplementation(() => {
      const calls: Call[] = [];
      const chain = query({ data: [], error: null }, calls) as Record<string, unknown>;
      return {
        ...chain,
        update: (patch: unknown) => {
          marks.push(calls);
          calls.push(["update", patch] as unknown as Call);
          return chain;
        },
        select: () => {
          queries.push(calls);
          return query({ data: pages[queries.length - 1] ?? [], error: null }, calls);
        },
      };
    });
    list.mockImplementation(async (dir: string) => ({ data: dir.endsWith("/e1") ? [{ id: "x", name: "job.flac" }] : [], error: null }));
    const { runTakesRetentionJanitor } = await import("@/lib/takes/takes-janitor");
    const now = new Date("2026-11-22T12:00:00Z");
    const result = await runTakesRetentionJanitor({ now, limit: 2 });

    expect(result.storageRemoved).toBe(4);
    expect(remove).toHaveBeenCalledTimes(5);
    // A cleaned copy goes with the dead take, and every finished row leaves the sweep.
    expect(remove).toHaveBeenCalledWith([`studio-cleanup/${OWNER}/e1/job.flac`]);
    expect(marks).toHaveLength(4);
    expect(queries[1]).toContainEqual(["is", "object_removed_at", null]);
    expect(queries[1].some((c) => c[0] === "or")).toBe(false);
    expect(queries[2]).toContainEqual([
      "or",
      'updated_at.gt."2026-11-01T00:00:02+00:00",and(updated_at.eq."2026-11-01T00:00:02+00:00",id.gt.e2)',
    ]);
    const failed = queries[3];
    expect(failed).toContainEqual(["eq", "status", "FAILED"]);
    expect(failed.some((c) => c[0] === "eq" && c[1] === "failure_reason")).toBe(false);
    expect(failed).toContainEqual(["lte", "updated_at", "2026-11-21T12:00:00.000Z"]);
  });
});
