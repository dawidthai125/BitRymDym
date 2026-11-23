import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateTarget, pickSampleOfTheWeek } from "@/lib/community/community-service";
import { getPublishedBeat, listPublishedBeatBoardKeys } from "@/lib/beats/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/beats/public-author", () => ({
  loadPublicAuthorDisplayNames: vi.fn(async () => new Map()),
  withPublicAuthors: vi.fn(async (beats: unknown[]) => beats),
}));
vi.mock("@/lib/beats/service", async (original) => ({
  ...(await original<typeof import("@/lib/beats/service")>()),
  getPublishedBeat: vi.fn(),
}));

const BEAT = "22222222-3333-4444-8555-666666666666";

beforeEach(() => vi.clearAllMocks());

describe("beat ranking board", () => {
  it("takes free and paid beats whose author entered the ranking, without sold ones", async () => {
    const filters: unknown[][] = [];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (...args: unknown[]) => (filters.push(["eq", ...args]), builder),
      is: (...args: unknown[]) => (filters.push(["is", ...args]), builder),
      or: (...args: unknown[]) => (filters.push(["or", ...args]), builder),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: () => builder } as never);
    await listPublishedBeatBoardKeys();
    expect(filters).toContainEqual(["eq", "in_rankings", true]);
    expect(filters).toContainEqual(["eq", "visibility", "public"]);
    expect(filters).toContainEqual(["is", "sold_at", null]);
    expect(filters.flat()).not.toContain("catalog_lane");
    expect(filters.some((f) => f[0] === "or")).toBe(false);
  });

  it("does not take a vote when the author left ratings off", async () => {
    vi.mocked(getPublishedBeat).mockResolvedValue({ id: BEAT, title: "Bit", ownerId: "o", ownershipType: "USER", visibility: "public" } as never);
    const upsert = vi.fn(async () => ({ error: null }));
    const withRatings = (allow: boolean) => ({
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: { id: BEAT, allow_ratings: allow, allow_comments: false }, error: null }),
          upsert,
        };
        return b;
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(withRatings(false) as never);
    expect(await rateTarget("viewer", "beat", BEAT, 5)).toBe("closed");
    expect(upsert).not.toHaveBeenCalled();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(withRatings(true) as never);
    expect(await rateTarget("viewer", "beat", BEAT, 5)).toBe("ok");
    expect(await rateTarget("o", "beat", BEAT, 5)).toBe("own");
  });

  it("sample of the week skips samples out of the ranking", () => {
    const base = { ratingAvg: 5, ratingCount: 9, weekAvg: 5, weekCount: 9 };
    expect(pickSampleOfTheWeek([{ id: "a", inRankings: false, ...base }])).toBeNull();
    expect(pickSampleOfTheWeek([{ id: "a", inRankings: false, ...base }, { id: "b", inRankings: true, ...base, weekAvg: 2 }])?.id).toBe("b");
  });
});
