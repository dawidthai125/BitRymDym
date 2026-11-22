import { beforeEach, describe, expect, it, vi } from "vitest";

import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { loadThread } from "@/lib/community/community-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/catalog/catalog-service", () => ({ findLiveCatalogWork: vi.fn() }));
vi.mock("@/lib/beats/public-author", () => ({ loadPublicAuthorDisplayNames: vi.fn(async () => new Map()) }));

const WORK_ID = "22222222-3333-4444-8555-666666666666";

type Row = { id: string; user_id: string; body: string; created_at: string; deleted_at: string | null; hidden_at: string | null };

const STORED: Row[] = [
  { id: "c3", user_id: "viewer", body: "moj", created_at: "2026-11-22T10:03:00Z", deleted_at: null, hidden_at: null },
  { id: "c2", user_id: "other", body: "ukryty", created_at: "2026-11-22T10:02:00Z", deleted_at: null, hidden_at: "2026-11-22T11:00:00Z" },
  { id: "c1", user_id: "other", body: "usuniety", created_at: "2026-11-22T10:01:00Z", deleted_at: "2026-11-22T11:00:00Z", hidden_at: null },
  { id: "c0", user_id: "other", body: "widoczny", created_at: "2026-11-22T10:00:00Z", deleted_at: null, hidden_at: null },
];

/** Applies `.is(column, null)` like PostgREST would, so leaks show up in the result. */
function fakeAdmin(role: string | null) {
  function from(table: string) {
    const nullFilters: string[] = [];
    const run = () => {
      if (table === "community_comments") {
        return { data: STORED.filter((row) => nullFilters.every((column) => row[column as keyof Row] === null)), error: null };
      }
      if (table === "profiles") return { data: role ? { role } : null, error: null };
      return { data: [], error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      is: (column: string) => {
        nullFilters.push(column);
        return builder;
      },
      maybeSingle: () => Promise.resolve(run()),
      then: (ok: (value: unknown) => unknown, fail: (reason: unknown) => unknown) => Promise.resolve(run()).then(ok, fail),
    };
    return builder;
  }
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ from } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findLiveCatalogWork).mockResolvedValue({
    id: WORK_ID,
    title: "Numer",
    ownerId: "owner",
    author: "Autor",
    allowComments: true,
    allowRatings: true,
  } as never);
});

describe("loadThread visibility", () => {
  it("never returns hidden or deleted comments", async () => {
    fakeAdmin(null);
    const thread = await loadThread("work", WORK_ID, null);
    expect(thread.comments.map((comment) => comment.id)).toEqual(["c0", "c3"]);
    expect(JSON.stringify(thread)).not.toMatch(/ukryty|usuniety|user_id|viewer/);
  });

  it("flags the viewer's own comment and lets only owner/staff hide", async () => {
    fakeAdmin("USER");
    const viewer = await loadThread("work", WORK_ID, "viewer");
    expect(viewer.comments.find((c) => c.id === "c3")).toMatchObject({ mine: true, canHide: false });
    expect(viewer.comments.find((c) => c.id === "c0")).toMatchObject({ mine: false, canHide: false });

    const owner = await loadThread("work", WORK_ID, "owner");
    expect(owner.comments.every((c) => c.canHide)).toBe(true);

    fakeAdmin("MODERATOR");
    const staff = await loadThread("work", WORK_ID, "mod");
    expect(staff.comments.every((c) => c.canHide && !c.mine)).toBe(true);
  });
});
