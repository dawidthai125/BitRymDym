import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ role: "USER", log: [] as unknown[] }));
const ASSET = "33333333-3333-4333-8333-333333333333";
const SAMPLE = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/auth/session", () => ({ requireRole: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.update = (patch: unknown) => (db.log.push({ update: table, patch }), query);
      query.delete = () => (db.log.push({ delete: table }), query);
      query.maybeSingle = async () => ({
        data:
          table === "profiles"
            ? { role: db.role }
            : table === "catalog_assets"
              ? { object_key: `catalog/${ASSET}.wav` }
              : { id: SAMPLE, owner_id: "o", object_key: `user-samples/${SAMPLE}/original.bin`, catalog_asset_id: ASSET },
        error: null,
      });
      query.then = (done: (value: unknown) => unknown) => done({ error: null });
      return query;
    },
    storage: { from: () => ({ remove: async (keys: string[]) => (db.log.push({ files: keys }), { error: null }) }) },
  }),
}));

import { adminRemoveCatalogSample } from "@/lib/studio/samples/sample-admin";

beforeEach(() => {
  db.log.length = 0;
});

describe("adminRemoveCatalogSample", () => {
  it("a user's sample goes private, loses its catalog copy and keeps its own file", async () => {
    db.role = "USER";
    expect(await adminRemoveCatalogSample(SAMPLE)).toEqual({ ok: true, removed: "unlisted" });
    expect(db.log).toEqual([
      { update: "studio_samples", patch: { status: "PRIVATE", public_listing: false, catalog_asset_id: null } },
      { delete: "catalog_assets" },
      { files: [`catalog/${ASSET}.wav`] },
    ]);
  });

  it("a BitRymDym sample is deleted with its file and its catalog copy", async () => {
    db.role = "ADMIN";
    expect(await adminRemoveCatalogSample(SAMPLE)).toEqual({ ok: true, removed: "deleted" });
    expect(db.log).toEqual([
      { delete: "studio_samples" },
      { files: [`user-samples/${SAMPLE}/original.bin`] },
      { delete: "catalog_assets" },
      { files: [`catalog/${ASSET}.wav`] },
    ]);
  });
});
