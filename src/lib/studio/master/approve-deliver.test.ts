import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/plans/usage-resets", () => ({ usageWindowStart: vi.fn(async (_u: string, _m: string, d: string) => d) }));
vi.mock("@/lib/studio/quota-credits-read", () => ({ studioQuotaRemaining: vi.fn(async () => 0) }));
vi.mock("@/lib/studio/master/own-content", () => ({ projectHasOwnContent: vi.fn(async () => true) }));
vi.mock("./reference-server", () => ({ referenceGateFor: vi.fn(async () => ({ allowed: true })) }));

const O = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const J = "44444444-4444-4444-8444-444444444444";

const s = vi.hoisted(() => ({ version: 3, job: null as Record<string, unknown> | null, log: [] as string[], song: true, insertError: null as { code?: string; message: string } | null }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string) => {
      s.log.push(name);
      if (name === "consume_studio_download") return { data: [{ allowed: true, used: 1, week_limit: null, reset_at: null }], error: null };
      return { data: [{ allowed: s.song, used: 1, day_limit: 1 }], error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let op = "select";
      const q: Record<string, unknown> = {
        insert: async () => (s.log.push(`insert ${table}`), { error: s.insertError }),
        maybeSingle: async () => {
          if (op === "update") s.log.push(`update ${table}`);
          return { data: table === "studio_projects" ? { id: P, document_version: s.version } : s.job, error: null };
        },
        then: (ok: (v: unknown) => unknown) => {
          if (op === "delete") s.log.push(`delete ${table} ${filters.project_id === P && filters.job_id === J && filters.owner_id === O}`);
          return Promise.resolve({ data: [], error: null }).then(ok);
        },
      };
      for (const m of ["select", "not", "order", "limit", "gte", "is"]) q[m] = () => q;
      q.eq = (k: string, v: unknown) => ((filters[k] = v), q);
      q.update = () => ((op = "update"), q);
      q.delete = () => ((op = "delete"), q);
      return q;
    },
  }),
}));

import { approveStudioMaster, commitStudioDeliver } from "./server";

// 2026-11-26 upload screen: passes in these tests (covered by its own tests).
vi.mock("@/lib/rights/upload-screen", async () => (await import("@/test/upload-screen-mock")).uploadScreenMock());

beforeEach(() => {
  s.version = 3;
  s.job = { id: J, result_object_key: "k/out/master.flac", source_document_version: 3 };
  s.log = [];
  s.song = true;
  s.insertError = null;
});

describe("approveStudioMaster", () => {
  const p = { ownerId: O, projectId: P, jobId: J };
  it("approves the master of the current mix", async () => {
    expect(await approveStudioMaster(p)).toEqual({ ok: true });
    expect(s.log).toEqual(["update studio_master_jobs"]);
  });
  it("a master of an older mix is refused, not approved", async () => {
    s.version = 4;
    expect(await approveStudioMaster(p)).toEqual({ ok: false, error: "doc_changed" });
    s.job = null;
    expect(await approveStudioMaster(p)).toEqual({ ok: false, error: "not_ready" });
    expect(s.log).toEqual([]);
  });
});

describe("commitStudioDeliver", () => {
  const p = { ownerId: O, projectId: P, tier: "GOLD" as const, jobId: J, kind: "master", format: "WAV_24" };
  it("counts the download first, then the song, then queues the job", async () => {
    expect(await commitStudioDeliver(p)).toMatchObject({ ok: true, jobId: J });
    expect(s.log).toEqual(["consume_studio_download", "claim_song_completion", "insert studio_master_jobs"]);
  });
  it("gives the download slot back when the song limit refuses", async () => {
    s.song = false;
    expect(await commitStudioDeliver(p)).toMatchObject({ ok: false, error: "song_day_limit" });
    expect(s.log).toEqual(["consume_studio_download", "claim_song_completion", "delete studio_download_usage true"]);
  });
  it("gives it back when the job cannot be queued", async () => {
    s.insertError = { message: "boom" };
    await expect(commitStudioDeliver(p)).rejects.toThrow("boom");
    expect(s.log.at(-1)).toBe("delete studio_download_usage true");
  });
});
