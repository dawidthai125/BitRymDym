import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ calls: [] as string[], counts: {} as Record<string, number>, rows: {} as Record<string, unknown[]>, removed: [] as string[] }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      let op = "select";
      const query: Record<string, unknown> = {};
      for (const name of ["eq", "in"]) query[name] = () => query;
      query.select = () => query;
      for (const name of ["delete", "update"]) {
        query[name] = () => {
          op = name;
          admin.calls.push(`${name}:${table}`);
          return query;
        };
      }
      query.maybeSingle = async () => ({ data: (admin.rows[table] ?? [])[0] ?? null, error: null });
      query.then = (done: (value: unknown) => unknown) =>
        done({ data: op === "select" ? (admin.rows[table] ?? []) : null, count: admin.counts[table] ?? 0, error: null });
      return query;
    },
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async (keys: string[]) => {
          admin.removed.push(...keys);
          return { error: null };
        },
      }),
    },
    auth: { admin: { deleteUser: async () => { admin.calls.push("auth:deleteUser"); return { error: null }; } } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/auth/reauth", () => ({ reauthenticateWithPassword: vi.fn() }));

import { executeAccountProfile01Deletion } from "@/lib/auth/delete-account";

const USER = "11111111-1111-4111-8111-111111111111";
const SAMPLE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  admin.calls.length = 0;
  admin.removed.length = 0;
  admin.counts = {};
  admin.rows = {};
});

describe("account deletion", () => {
  it("refuses before touching anything when permanent rights records point at the account", async () => {
    admin.counts = { beat_rights_basis: 1 };
    const result = await executeAccountProfile01Deletion(USER);
    expect(result).toMatchObject({ ok: false, step: "preflight_rights" });
    expect(admin.calls).toEqual([]);
  });

  it("removes the user's samples with both files before the account", async () => {
    admin.rows = {
      studio_samples: [{ id: SAMPLE, object_key: `user-samples/${SAMPLE}/original.bin`, catalog_asset_id: "asset" }],
      catalog_assets: [{ object_key: "catalog/asset/sample.wav" }],
    };
    expect(await executeAccountProfile01Deletion(USER)).toEqual({ ok: true });
    const order = ["delete:studio_samples", "delete:catalog_assets", "auth:deleteUser"].map((c) => admin.calls.indexOf(c));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(admin.removed).toEqual(expect.arrayContaining([`user-samples/${SAMPLE}/original.bin`, "catalog/asset/sample.wav"]));
  });

  it("guard triggers let only FK cascades through (quota credits, premium rows)", () => {
    const sql = readFileSync("supabase/migrations/20261124210000_account_deletion_cascade_guards.sql", "utf8");
    for (const table of ["studio_quota_credits", "premium_works", "premium_credit_periods", "premium_track_unlocks", "premium_unlock_events"]) {
      expect(sql).toContain(`raise exception 'Only service_role may mutate ${table}'`);
    }
    expect(sql.match(/studio_guard_cascade_delete_allowed\(\)/g)).toHaveLength(5);
    expect(sql).toContain("premium_unlock_events is append-only");
  });
});
