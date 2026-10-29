import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { parseAdminBeatsQuery } from "@/lib/beats/admin-catalogue-query";
import type { PermissionKey } from "@/types/permissions";

type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];
type Resp = { data: unknown; count?: number; error?: null };
let tableData: Record<string, Resp | Resp[]> = {};

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  for (const m of ["select", "eq", "in", "or", "order", "range", "update", "insert", "maybeSingle", "single"]) {
    chain[m] = record(m);
  }
  chain.then = (resolve: (v: unknown) => unknown) => {
    const entry = tableData[table] ?? { data: [] };
    const resp = Array.isArray(entry) ? (entry.shift() ?? { data: null }) : entry;
    return resolve({ error: null, ...resp });
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: (t: string) => builder(t) }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (t: string) => builder(`admin:${t}`) }),
}));
// requireRole / requirePermission call requireUser through a module-internal
// binding, so re-express them on top of the mocked requireUser (same pattern as
// admin-route-access.test.ts).
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  const { hasRole, hasPermission } = await import("@/lib/auth/permissions");
  const requireUser = vi.fn();
  return {
    ...actual,
    requireUser,
    requireRole: async (allowed: readonly string[]) => {
      const context = (await requireUser()) as AuthContext;
      if (!hasRole(context.profile.role, allowed as never)) {
        throw new actual.AuthError("FORBIDDEN", "Insufficient role.");
      }
      return context;
    },
    requirePermission: async (permission: PermissionKey) => {
      const context = (await requireUser()) as AuthContext;
      if (!hasPermission(context.permissions, permission)) {
        throw new actual.AuthError("FORBIDDEN", "Missing permission.");
      }
      return context;
    },
  };
});

const { listPlatformBeatCatalogueForAdmin, updateBeatMetadata } = await import(
  "@/lib/beats/service"
);
const requireUserMock = vi.mocked(requireUser);

function ctx(role: AuthContext["profile"]["role"], permissions: PermissionKey[]): AuthContext {
  return {
    userId: "u1",
    email: "a@example.test",
    profile: {
      id: "u1",
      displayName: "Admin",
      userNumber: 1,
      role,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions,
  };
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: null,
  ownership_type: "PLATFORM",
  title: "Noc",
  producer: null,
  description: null,
  genre: null,
  style: null,
  bpm: 90,
  key: null,
  scale: null,
  duration_seconds: 120,
  tags: [],
  cover_ref: null,
  status: "PUBLISHED",
  created_at: "2026-10-20T08:30:00.000Z",
  updated_at: "2026-10-20T08:30:00.000Z",
  rejection_reason: null,
  last_submitted_at: null,
};

beforeEach(() => {
  calls.length = 0;
  tableData = {};
  requireUserMock.mockReset();
});

describe("admin beat catalogue — server-side guard", () => {
  it.each([
    ["anonymous", () => Promise.reject(new AuthError("UNAUTHENTICATED", "x")), "UNAUTHENTICATED"],
    ["plain user", () => Promise.resolve(ctx("USER", [])), "FORBIDDEN"],
    ["moderator", () => Promise.resolve(ctx("MODERATOR", ["beats.edit"])), "FORBIDDEN"],
    ["admin without beats.edit", () => Promise.resolve(ctx("ADMIN", [])), "FORBIDDEN"],
  ] as const)("%s cannot list or edit", async (_label, impl, code) => {
    requireUserMock.mockImplementation(impl as never);
    await expect(listPlatformBeatCatalogueForAdmin(parseAdminBeatsQuery({}))).rejects.toMatchObject({ code });
    await expect(updateBeatMetadata(ROW.id, { title: "x" })).rejects.toMatchObject({ code });
    expect(calls).toEqual([]);
  });

  it("admin list orders by the whitelisted column and paginates with range", async () => {
    requireUserMock.mockResolvedValue(ctx("ADMIN", ["beats.edit"]));
    tableData.beats = { data: [ROW], count: 23 };
    tableData["admin:beat_download_events"] = { data: [{ beat_id: ROW.id }, { beat_id: ROW.id }] };
    const res = await listPlatformBeatCatalogueForAdmin(
      parseAdminBeatsQuery({ sort: "bpm", dir: "asc", page: "2", q: "no,c" }),
    );
    const beatCalls = calls.filter((c) => c.table === "beats");
    expect(beatCalls).toContainEqual({ table: "beats", method: "eq", args: ["ownership_type", "PLATFORM"] });
    expect(beatCalls).toContainEqual({ table: "beats", method: "order", args: ["bpm", { ascending: true, nullsFirst: false }] });
    expect(beatCalls).toContainEqual({ table: "beats", method: "range", args: [20, 39] });
    expect(beatCalls).toContainEqual({ table: "beats", method: "or", args: ['title.ilike."*no c*",producer.ilike."*no c*"'] });
    expect(res).toMatchObject({ total: 23, page: 2, pageCount: 2 });
    expect(res.rows[0]).toMatchObject({ id: ROW.id, downloadCount: 2, activeMasterReady: false });
  });

  it("admin edit writes the beat and a BEAT_METADATA_UPDATE audit row", async () => {
    requireUserMock.mockResolvedValue(ctx("ADMIN", ["beats.edit"]));
    tableData.beats = [
      { data: ROW },
      { data: { ...ROW, title: "Noc 2", producer: "Dawid", created_at: "2026-10-01T12:00:00.000Z" } },
    ];
    await updateBeatMetadata(ROW.id, { title: "Noc 2", producer: "Dawid", uploadDate: "2026-10-01" });
    const update = calls.find((c) => c.table === "beats" && c.method === "update");
    expect(update?.args[0]).toMatchObject({ title: "Noc 2", producer: "Dawid", created_at: "2026-10-01T12:00:00.000Z" });
    const audit = calls.find((c) => c.table === "admin:admin_audit_events" && c.method === "insert");
    expect(audit?.args[0]).toMatchObject({ action: "BEAT_METADATA_UPDATE", actor_user_id: "u1" });
  });

  it("rejects an invalid upload date before writing", async () => {
    requireUserMock.mockResolvedValue(ctx("ADMIN", ["beats.edit"]));
    tableData.beats = { data: ROW };
    await expect(updateBeatMetadata(ROW.id, { uploadDate: "2099-01-01" })).rejects.toThrow(/przyszłości/);
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });
});
