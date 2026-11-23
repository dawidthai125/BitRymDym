import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls: string[] = [];
let failAdd = false;
let failDelete = false;
const clip = (id: string, start: number) => ({ id, trackId: "t1", sourceKind: "TAKE", sourceTakeId: `take-${id}`, timelineStartMs: start, durationMs: 4000, sourceOffsetMs: 0 });

vi.mock("@/lib/auth/session", () => ({ AuthError: class AuthError extends Error {}, requireUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "take-new", owner_id: "u1", status: "READY", deleted_at: null, duration_seconds: 6, beat_id: "b" }, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/studio/studio-service", () => ({
  getStudioProjectDocumentFor: async () => ({
    project: { timelineLengthMs: 60_000, documentVersion: 7, beatId: "b" },
    tracks: [{ id: "t1" }],
    clips: [clip("a", 0), clip("b", 4500), clip("far", 30_000)],
  }),
  addStudioClipFor: async (_c: unknown, input: { expectedDocumentVersion: number }) => {
    calls.push(`add@${input.expectedDocumentVersion}`);
    if (failAdd) throw new Error("boom");
    return { clip: clip("new", 1000), documentVersion: input.expectedDocumentVersion + 1 };
  },
  deleteStudioClipFor: async (_c: unknown, input: { clipId: string; expectedDocumentVersion: number }) => {
    calls.push(`delete ${input.clipId}@${input.expectedDocumentVersion}`);
    if (failDelete) throw new Error("boom");
    return { documentVersion: input.expectedDocumentVersion + 1 };
  },
}));

const { placeReadyTakeAsStudioClipFor } = await import("@/lib/studio/studio-record-service");
const place = () =>
  placeReadyTakeAsStudioClipFor({ userId: "u1" } as never, {
    projectId: "p", trackId: "t1", takeId: "take-new", timelineStartMs: 1000, expectedDocumentVersion: 7, replaceOverlapping: true,
  });

describe("replace on track", () => {
  beforeEach(() => {
    calls.length = 0;
    failAdd = false;
    failDelete = false;
  });

  it("adds first, then removes every overlapping take and reports them", async () => {
    const r = await place();
    expect(calls).toEqual(["add@7", "delete a@8", "delete b@9"]);
    expect(r.removedClipIds).toEqual(["a", "b"]);
    expect(r.documentVersion).toBe(10);
  });

  it("keeps the old clips when the new one cannot be added", async () => {
    failAdd = true;
    await expect(place()).rejects.toThrow("boom");
    expect(calls).toEqual(["add@7"]);
  });

  it("still reports the saved clip when an old one cannot be removed", async () => {
    failDelete = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await place();
    expect(r.removedClipIds).toEqual([]);
    expect(r.clip.id).toBe("new");
    expect(r.documentVersion).toBe(8);
    spy.mockRestore();
  });
});
