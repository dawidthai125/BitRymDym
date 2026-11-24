import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; args: unknown[] };
let calls: Call[] = [];
let counts: Record<string, number> = {};
let failing: string | null = null;
let project: { id: string; owner_id: string; status: string } | null = null;
const removedFiles: string[][] = [];

function builder(table: string) {
  let head = false;
  let inStatus = false;
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      resolve(
        failing === table && !head
          ? { data: null, error: { message: "boom" } }
          : head
            ? { count: inStatus ? (counts[`${table}:busy`] ?? 0) : (counts[table] ?? 0), error: null }
            : { data: table === "audio_artifacts" ? [{ id: "a1", storage_bucket: "b", object_key: "k.wav" }] : table === "studio_projects" ? project : null, error: null },
      ),
  };
  for (const op of ["select", "eq", "in", "is", "update", "delete", "maybeSingle"]) {
    chain[op] = (...args: unknown[]) => {
      if (op === "select" && (args[1] as { head?: boolean } | undefined)?.head) head = true;
      if (op === "in") inStatus = true;
      calls.push({ table, op, args });
      return chain;
    };
  }
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: builder,
    storage: { from: () => ({ remove: async (keys: string[]) => (removedFiles.push(keys), { error: null }), list: async () => ({ data: [], error: null }) }) },
  }),
}));
const plainDelete = vi.hoisted(() => vi.fn(async (_c: unknown, id: string) => ({ id })));
vi.mock("@/lib/studio/studio-service", () => ({ deleteStudioProjectFor: plainDelete }));
vi.mock("@/lib/auth/session", () => ({
  AuthError: class extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
  requireUser: vi.fn(),
}));

const { removeStudioProjectFor, REMOVED_PROJECT_TITLE, PROJECT_BUSY_PL } = await import("./studio-project-remove-server");

const P = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const me = { userId: "u1" } as Parameters<typeof removeStudioProjectFor>[0];
const deletedTables = () => calls.filter((c) => c.op === "delete").map((c) => c.table);

beforeEach(() => {
  calls = [];
  counts = {};
  failing = null;
  removedFiles.length = 0;
  project = { id: P, owner_id: "u1", status: "DRAFT" };
  plainDelete.mockClear();
});

describe("removeStudioProjectFor", () => {
  it("a project without usage is deleted for good", async () => {
    await removeStudioProjectFor(me, P);
    expect(plainDelete).toHaveBeenCalledOnce();
    expect(deletedTables()).toEqual([]);
  });

  it.each(["render_jobs", "studio_master_jobs", "studio_song_completions", "studio_cleanup_jobs", "studio_separate_jobs"])(
    "%s keep their rows (limits, history); content and files go",
    async (table) => {
      counts = { [table]: 1 };
      await removeStudioProjectFor(me, P);
      expect(plainDelete).not.toHaveBeenCalled();
      expect(deletedTables()).toEqual(expect.arrayContaining(["catalog_works", "studio_tracks", "studio_listen_links", "studio_project_lyrics"]));
      expect(deletedTables()).not.toContain(table);
      expect(removedFiles).toContainEqual(["k.wav"]);
      const last = calls.filter((c) => c.op === "update").at(-1)!;
      expect(last.table).toBe("studio_projects");
      expect(last.args[0]).toMatchObject({ status: "ARCHIVED", title: REMOVED_PROJECT_TITLE, beat_id: null });
    },
  );

  it("waits for a running export or master", async () => {
    counts = { "studio_master_jobs:busy": 1, studio_master_jobs: 1 };
    await expect(removeStudioProjectFor(me, P)).rejects.toThrow(PROJECT_BUSY_PL);
    expect(deletedTables()).toEqual([]);
  });

  it("after an error the project stays on the list", async () => {
    counts = { render_jobs: 1 };
    failing = "studio_tracks";
    await expect(removeStudioProjectFor(me, P)).rejects.toThrow("studio_tracks");
    expect(calls.some((c) => c.table === "studio_projects" && c.op === "update")).toBe(false);
  });

  it("someone else's, removed or missing project", async () => {
    project = { id: P, owner_id: "u2", status: "DRAFT" };
    await expect(removeStudioProjectFor(me, P)).rejects.toMatchObject({ code: "FORBIDDEN" });
    project = { id: P, owner_id: "u1", status: "ARCHIVED" };
    await expect(removeStudioProjectFor(me, P)).rejects.toMatchObject({ code: "NOT_FOUND" });
    project = null;
    await expect(removeStudioProjectFor(me, P)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deletedTables()).toEqual([]);
  });
});
