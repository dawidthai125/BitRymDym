/**
 * saveOwnerCatalog against an in-memory table (owner incident 2026-11-26): after a moderator took a work
 * down, no master of that project may be published again; withdrawing stays allowed; a re-master of a
 * held project goes straight to a moderator; the rights statement is required for a first publish.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type RowData = Record<string, unknown>;
const db: { catalog_works: RowData[]; studio_master_jobs: RowData[] } = { catalog_works: [], studio_master_jobs: [] };

type Filter = (r: RowData) => boolean;

function query(table: keyof typeof db) {
  const filters: Filter[] = [];
  let op: { kind: "select" } | { kind: "update"; patch: RowData } | { kind: "insert"; row: RowData } = { kind: "select" };
  let limit = Infinity;
  const rows = () => db[table].filter((r) => filters.every((f) => f(r))).slice(0, limit);
  const run = () => {
    if (op.kind === "insert") {
      db[table].push({ id: `row-${db[table].length + 1}`, ...op.row });
      return { data: null, error: null };
    }
    const hit = rows();
    if (op.kind === "update") for (const r of hit) Object.assign(r, op.patch);
    return { data: hit.map((r) => ({ ...r })), error: null };
  };
  const b = {
    select: () => b,
    update: (patch: RowData) => ((op = { kind: "update", patch }), b),
    insert: (row: RowData) => ((op = { kind: "insert", row }), b),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
    limit: (n: number) => ((limit = n), b),
    maybeSingle: async () => ({ data: rows()[0] ? { ...rows()[0] } : null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (t: keyof typeof db) => query(t) }),
}));
vi.mock("@/lib/catalog/work-clip-server", () => ({ queueWorkClip: vi.fn(async () => undefined) }));

const { saveOwnerCatalog } = await import("@/lib/catalog/catalog-service");

const USER = "33333333-3333-4333-8333-333333333333";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const consents = { allowRatings: true, allowComments: true, inRankings: true };

function master(id: string) {
  db.studio_master_jobs.push({ id, project_id: PROJECT, owner_id: USER, kind: "master", status: "succeeded", approved_at: "2026-11-26T05:00:00Z" });
}
function work(masterJobId: string, over: RowData = {}) {
  db.catalog_works.push({
    id: `w-${masterJobId.slice(-1)}`, owner_id: USER, project_id: PROJECT, master_job_id: masterJobId, title: "Cień",
    withdrawn_at: null, check_status: "passed", check_result: null, rights_accepted_at: "2026-11-26T05:00:00Z", staff_at: null, ...over,
  });
}
const publish = (masterJobId: string, over: Partial<Parameters<typeof saveOwnerCatalog>[0]> = {}) =>
  saveOwnerCatalog({ userId: USER, projectId: PROJECT, masterJobId, title: "Cień", publish: true, consents, rightsAccepted: true, ...over });

beforeEach(() => {
  db.catalog_works = [];
  db.studio_master_jobs = [];
  master(M1);
  master(M2);
});

describe("saveOwnerCatalog", () => {
  it("a first publish needs the rights statement and goes to the check", async () => {
    expect(await publish(M1, { rightsAccepted: false })).toBe("rights");
    expect(await publish(M1)).toBe("checking");
    expect(db.catalog_works[0]).toMatchObject({ check_status: "pending", rights_accepted_at: expect.any(String) });
  });

  it("a master taken down by a moderator stays down: same master and a new master are blocked", async () => {
    work(M1, { check_status: "removed", withdrawn_at: "2026-11-26T05:30:00Z", staff_at: "2026-11-26T05:30:00Z" });
    expect(await publish(M1)).toBe("blocked");
    expect(await publish(M2)).toBe("blocked");
    expect(db.catalog_works).toHaveLength(1);
  });

  it("a rejected project blocks a new master too", async () => {
    work(M1, { check_status: "rejected", withdrawn_at: "2026-11-26T05:30:00Z", staff_at: "2026-11-26T05:30:00Z" });
    expect(await publish(M2)).toBe("blocked");
  });

  it("withdrawing is always allowed, also after a take-down", async () => {
    work(M1, { check_status: "removed", withdrawn_at: "2026-11-26T05:30:00Z", staff_at: "2026-11-26T05:30:00Z" });
    expect(await saveOwnerCatalog({ userId: USER, projectId: PROJECT, masterJobId: M1, title: "Cień", publish: false, consents })).toBe("ok");
  });

  it("a re-master of a project held with findings goes straight to a moderator", async () => {
    work(M1, { check_status: "held", withdrawn_at: "2026-11-26T05:30:00Z", check_result: { findings: ["Wgrana ścieżka pasuje do bitu z katalogu „Klatka Schodowa”."] } });
    expect(await publish(M2)).toBe("held");
    expect(db.catalog_works.find((r) => r.master_job_id === M2)).toMatchObject({ check_status: "held" });
  });

  it("a passed master withdrawn by the owner goes back live without a new check", async () => {
    work(M1, { withdrawn_at: "2026-11-26T05:30:00Z" });
    expect(await publish(M1, { rightsAccepted: false })).toBe("ok");
    expect(db.catalog_works[0]).toMatchObject({ withdrawn_at: null, check_status: "passed" });
  });

  it("another owner's row is never touched", async () => {
    work(M1, { owner_id: "99999999-9999-4999-8999-999999999999" });
    expect(await publish(M1)).toBe("invalid");
  });
});
