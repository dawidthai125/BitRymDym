import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));

const tags: string[] = [];
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: (tag: string) => tags.push(tag),
  revalidatePath: vi.fn(),
}));

type Answer = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };
let answers: Record<string, Answer[]> = {};
let queries: { table: string; op: string; args: unknown[] }[] = [];
let rpcs: { name: string; args: unknown }[] = [];
let rpcAnswer: Answer = { data: [], error: null };

function builder(table: string) {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: Answer) => unknown) => resolve(answers[table]?.shift() ?? { data: null, error: null, count: 0 }),
  };
  for (const op of ["select", "eq", "neq", "is", "or", "not", "in", "order", "limit", "update", "insert", "maybeSingle", "single"]) {
    chain[op] = (...args: unknown[]) => {
      queries.push({ table, op, args });
      return chain;
    };
  }
  return chain;
}

let adminAvailable = true;
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (!adminAvailable) throw new Error("no key");
    return {
      from: (table: string) => builder(table),
      rpc: async (name: string, args: unknown) => {
        rpcs.push({ name, args });
        return rpcAnswer;
      },
    };
  },
}));
vi.mock("@/lib/catalog/catalog-service", () => ({
  readWorkPlaces: vi.fn(async (period: string) =>
    period === "week"
      ? [
          { place: 2, targetId: "w1", title: "Mój", ownerId: "owner-1" },
          { place: 1, targetId: "w9", title: "Cudzy", ownerId: "owner-9" },
        ]
      : [],
  ),
}));
vi.mock("@/lib/catalog/work-clip-server", () => ({ loadWorkClips: vi.fn(async () => new Map([["w1", { state: "ready", seconds: 45 }]])) }));
vi.mock("@/lib/community/community-service", () => ({
  readBoardPlaces: vi.fn(async () => []),
  listOwnerPublicSamples: vi.fn(async () => ({ total: 1, samples: [{ id: "s1", author: "" }] })),
}));

const { creatorView, findCreator, loadCreatorFacts, loadOwnProfile, saveOwnProfile, listCreatorSitemapEntries, setCreatorProfileBlocked } = await import("./creator-profile-server");
const { loadCreatorIds, creatorHref, forgetCreatorHref, resetCreatorHrefsForTests } = await import("./creator-hrefs");
const { NO_SHARES, NO_FACTS } = await import("./profile-policy");

const ID = "abcde23456";
const MISSING = { code: "PGRST205", message: "Could not find the table 'public.public_profiles' in the schema cache" };
const OWNER = { display_name: "Żółty", experience_total: 900, created_at: "2026-03-05T10:00:00Z", role: "USER" };
const row = (extra: Record<string, unknown> = {}) => ({ owner_id: "owner-1", public_id: ID, enabled: true, blocked: false, ...extra });

beforeEach(() => {
  answers = {};
  queries = [];
  rpcs = [];
  tags.length = 0;
  rpcAnswer = { data: [], error: null };
  adminAvailable = true;
  resetCreatorHrefsForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("creatorView", () => {
  it("shows only the name while every switch is off", () => {
    const view = creatorView(row({ link_youtube: "https://www.youtube.com/@zolty" }), OWNER)!;
    expect(view).toMatchObject({ name: "Żółty", live: true, links: {}, experience: null, joinedMonth: null, path: `/tworca/${ID}-zolty` });
  });
  it("links, level and month appear with their switches", () => {
    const view = creatorView(row({ link_youtube: "https://www.youtube.com/@zolty", show_links: true, show_experience: true, show_joined: true }), OWNER)!;
    expect(view.links).toEqual({ youtube: "https://www.youtube.com/@zolty" });
    expect(view.experience).toEqual({ rank: "RISING_RAPPER", total: 900 });
    expect(view.joinedMonth).toBe("2026-03-01");
  });
  it("no ksywka → no page; blocked → not live; an admin's samples stay the house's", () => {
    expect(creatorView(row(), { ...OWNER, display_name: " " })).toBeNull();
    expect(creatorView(row({ blocked: true }), OWNER)?.live).toBe(false);
    expect(creatorView(row({ show_samples: true }), { ...OWNER, role: "ADMIN" })?.share.samples).toBe(false);
  });
});

describe("findCreator", () => {
  it("asks nothing for an address that cannot be one", async () => {
    expect(await findCreator("42-zolty")).toBeNull();
    expect(queries).toEqual([]);
  });
  it("table missing, no key or no row → nothing", async () => {
    answers.public_profiles = [{ data: null, error: MISSING }, { data: null, error: null }];
    expect(await findCreator(`${ID}-zolty`)).toBeNull();
    expect(await findCreator(`${ID}-zolty`)).toBeNull();
    adminAvailable = false;
    expect(await findCreator(`${ID}-zolty`)).toBeNull();
  });
  it("never selects the e-mail, the user number or the plan", async () => {
    answers.public_profiles = [{ data: { ...row(), profiles: OWNER }, error: null }];
    expect((await findCreator(`${ID}-x`))?.name).toBe("Żółty");
    const selected = queries.filter((q) => q.op === "select").map((q) => String(q.args[0])).join(" ");
    expect(selected).not.toMatch(/email|user_number|account_level|plan|\*/);
  });
});

describe("loadCreatorFacts", () => {
  const view = (share: Partial<typeof NO_SHARES>) => ({ ...creatorView(row(), OWNER)!, share: { ...NO_SHARES, ...share } });

  it("reads nothing that is not shared", async () => {
    expect(await loadCreatorFacts(view({}))).toEqual(NO_FACTS);
    expect(await loadCreatorFacts(view({ links: true, experience: true, joined: true }))).toEqual(NO_FACTS);
    expect(queries).toEqual([]);
  });
  it("public beats only: user-owned, published, public, unsold, not paid, capped", async () => {
    answers.beats = [{ data: [], error: null, count: 0 }];
    await loadCreatorFacts(view({ beats: true }));
    const used = queries.filter((q) => q.table === "beats").map((q) => [q.op, ...q.args].join(" "));
    expect(used).toEqual(expect.arrayContaining([
      "eq owner_id owner-1",
      "eq ownership_type USER",
      "eq status PUBLISHED",
      "eq visibility public",
      "is sold_at ",
      "or catalog_lane.is.null,catalog_lane.neq.paid",
      "limit 20",
    ]));
    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(["beats"]));
  });
  it("works in the catalogue only, and only the creator's own places", async () => {
    answers.catalog_works = [{ data: [{ id: "w1", title: "Mój" }], error: null, count: 1 }];
    const facts = await loadCreatorFacts(view({ works: true, rankings: true }));
    expect(queries.some((q) => q.table === "catalog_works" && q.op === "is" && q.args[0] === "withdrawn_at")).toBe(true);
    expect(facts.works).toEqual({ total: 1, items: [{ id: "w1", title: "Mój", clipSeconds: 45 }] });
    expect(facts.places).toEqual([{ kind: "work", period: "week", place: 2, targetId: "w1", title: "Mój" }]);
    expect(JSON.stringify(facts)).not.toContain("owner-");
  });
  it("one broken part does not take the page down", async () => {
    answers.catalog_works = [{ data: null, error: { message: "boom" } }];
    answers.studio_master_jobs = [{ data: [{ project_id: "p1" }, { project_id: "p1" }, { project_id: "p2" }], error: null }];
    expect(await loadCreatorFacts(view({ trackCount: true, recordingCount: true }))).toMatchObject({ trackCount: null, recordingCount: 2 });
  });
});

describe("saveOwnProfile", () => {
  it("saves nothing while a link is wrong", async () => {
    expect(await saveOwnProfile("owner-1", { enabled: true, links: { youtube: "https://evil.example" } })).toEqual({
      ok: false,
      code: "LINKS",
      errors: { youtube: "wrong_site" },
    });
    expect(queries).toEqual([]);
  });
  it("needs a ksywka to go public", async () => {
    answers.profiles = [{ data: { display_name: null }, error: null }];
    expect(await saveOwnProfile("owner-1", { enabled: true })).toEqual({ ok: false, code: "NO_NAME" });
  });
  it("table missing → off", async () => {
    answers.profiles = [{ data: { display_name: "Żółty" }, error: null }];
    answers.public_profiles = [{ data: null, error: MISSING }];
    expect(await saveOwnProfile("owner-1", { enabled: true })).toEqual({ ok: false, code: "OFF" });
  });
  it("first save makes a row with a random id; the owner cannot unblock or pick the id", async () => {
    answers.profiles = [{ data: { display_name: "Żółty" }, error: null }];
    answers.public_profiles = [
      { data: null, error: null },
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: null, error: null },
      { data: row(), error: null },
    ];
    const saved = await saveOwnProfile("owner-1", { enabled: true, blocked: false, public_id: "hackedhack", owner_id: "owner-9", share: { beats: true } });
    expect(saved).toMatchObject({ ok: true, path: `/tworca/${ID}-zolty` });
    for (const q of queries.filter((item) => item.op === "insert" || item.op === "update")) {
      const payload = q.args[0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("blocked");
      expect(payload.show_beats).toBe(true);
      expect(payload.show_works).toBe(false);
      if (q.op === "insert") {
        expect(payload.owner_id).toBe("owner-1");
        expect(payload.public_id).toMatch(/^[a-z2-9]{10}$/);
        expect(payload.public_id).not.toBe("hackedhack");
      } else expect(payload).not.toHaveProperty("owner_id");
    }
    expect(tags).toEqual(["creator-facts-owner-1"]);
  });
  it("settings say off when the table is missing", async () => {
    answers.public_profiles = [{ data: null, error: MISSING }];
    expect(await loadOwnProfile("owner-1")).toEqual({ state: "off" });
  });
});

describe("author links", () => {
  it("one call for the whole list, then remembered; off again after forgetting", async () => {
    rpcAnswer = { data: [{ owner_id: "owner-1", public_id: ID }], error: null };
    const ids = await loadCreatorIds(["owner-1", "owner-2", "owner-1", null]);
    expect(rpcs).toEqual([{ name: "public_profile_ids", args: { p_ids: ["owner-1", "owner-2"] } }]);
    expect(creatorHref(ids, "owner-1", "Żółty")).toBe(`/tworca/${ID}-zolty`);
    expect(creatorHref(ids, "owner-2", "Inny")).toBeNull();
    expect(creatorHref(ids, "owner-1", null)).toBeNull();
    await loadCreatorIds(["owner-2", "owner-1"]);
    expect(rpcs).toHaveLength(1);
    rpcAnswer = { data: [], error: null };
    forgetCreatorHref("owner-1");
    expect(creatorHref(await loadCreatorIds(["owner-1"]), "owner-1", "Żółty")).toBeNull();
  });
  it("asks again after half a minute", async () => {
    await loadCreatorIds(["owner-1"], 1_000);
    await loadCreatorIds(["owner-1"], 20_000);
    expect(rpcs).toHaveLength(1);
    await loadCreatorIds(["owner-1"], 40_000);
    expect(rpcs).toHaveLength(2);
  });
  it("function missing or no key → names stay text", async () => {
    rpcAnswer = { data: null, error: MISSING };
    expect((await loadCreatorIds(["owner-1"])).size).toBe(0);
    resetCreatorHrefsForTests();
    adminAvailable = false;
    expect((await loadCreatorIds(["owner-1"])).size).toBe(0);
  });
});

describe("sitemap and admin", () => {
  it("lists profiles with an address, none when the function is missing", async () => {
    rpcAnswer = { data: [{ public_id: ID, display_name: "Żółty", updated_at: "2026-11-23T10:00:00Z" }, { public_id: ID, display_name: " ", updated_at: "x" }], error: null };
    expect(await listCreatorSitemapEntries()).toEqual([{ path: `/tworca/${ID}-zolty`, updatedAt: "2026-11-23T10:00:00Z" }]);
    rpcAnswer = { data: null, error: MISSING };
    expect(await listCreatorSitemapEntries()).toEqual([]);
  });
  it("admin off switch touches only blocked", async () => {
    answers.public_profiles = [{ data: { blocked: false }, error: null }, { data: null, error: null }];
    expect(await setCreatorProfileBlocked("owner-1", true)).toEqual({ before: false });
    expect(queries.filter((q) => q.op === "update").map((q) => q.args[0])).toEqual([{ blocked: true }]);
    answers.public_profiles = [{ data: null, error: null }];
    expect(await setCreatorProfileBlocked("owner-2", true)).toBeNull();
  });
});
