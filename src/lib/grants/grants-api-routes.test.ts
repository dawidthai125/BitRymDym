/**
 * Security Wave 4 — beat access grant API end to end in process: real routes
 * (`/api/beats/[id]/grants`, `.../[grantId]/revoke`, `/api/account/grants`),
 * real session guard, real grant service and shared error classifier against
 * a fake Supabase that applies filters and records every admin query / RPC.
 * The `create_beat_access_grant` RPC is emulated with the checks of migration
 * 20260928140000 (owner, PUBLISHED, grantee, expiry, active duplicate).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Filter = [column: string, kind: "eq" | "is" | "in", value: unknown];
type Op = {
  table: string;
  op: "select" | "update" | "rpc";
  payload?: Row;
  filters: Filter[];
};

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const GRANTEE = "55555555-5555-4555-8555-555555555555";
const BEAT = "33333333-3333-4333-8333-333333333333";
const OTHER_BEAT = "44444444-4444-4444-8444-444444444444";
const GRANT = "66666666-6666-4666-8666-666666666666";
const OTHER_GRANT = "77777777-7777-4777-8777-777777777777";
const RAW_DB_ERROR =
  'connection to server at "db.internal" (10.0.0.5) failed: password authentication failed, token=abc';

const db = vi.hoisted(() => ({
  viewer: null as null | string,
  tables: {} as Record<string, Record<string, unknown>[]>,
  ops: [] as {
    table: string;
    op: "select" | "update" | "rpc";
    payload?: Record<string, unknown>;
    filters: [string, "eq" | "is" | "in", unknown][];
  }[],
  failWhen: null as
    | null
    | ((op: { table: string; op: string }) => string | null),
}));

function execute(op: Op): { data: Row[] | null; error: { message: string } | null } {
  db.ops.push(op);
  const injected = db.failWhen?.(op);
  if (injected) return { data: null, error: { message: injected } };

  const rows = db.tables[op.table] ?? [];
  const matches = (row: Row) =>
    op.filters.every(([column, kind, value]) =>
      kind === "in"
        ? (value as unknown[]).includes(row[column])
        : kind === "is"
          ? (row[column] ?? null) === value
          : row[column] === value,
    );
  const matched = rows.filter(matches);
  if (op.op === "update") {
    matched.forEach((row) => Object.assign(row, op.payload));
  }
  return { data: matched.map((row) => ({ ...row })), error: null };
}

function adminQuery(table: string) {
  const op: Op = { table, op: "select", filters: [] };
  let limit: number | null = null;
  const run = () => {
    const result = execute(op);
    if (result.data && limit != null) result.data = result.data.slice(0, limit);
    return result;
  };
  const builder = {
    select: () => builder,
    update: (payload: Row) => {
      op.op = "update";
      op.payload = payload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      op.filters.push([column, "eq", value]);
      return builder;
    },
    is: (column: string, value: unknown) => {
      op.filters.push([column, "is", value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      op.filters.push([column, "in", value]);
      return builder;
    },
    order: () => builder,
    limit: (n: number) => {
      limit = n;
      return builder;
    },
    maybeSingle: async () => {
      const result = run();
      if (result.error) return { data: null, error: result.error };
      return { data: result.data?.[0] ?? null, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => resolve(run()),
  };
  return builder;
}

function rpcError(message: string) {
  return { data: null, error: { message, code: "P0001" } };
}

/** Emulates public.create_beat_access_grant (service_role, advisory-locked). */
async function createGrantRpc(name: string, args: Row) {
  const op: Op = { table: `rpc:${name}`, op: "rpc", payload: args, filters: [] };
  db.ops.push(op);
  const injected = db.failWhen?.(op);
  if (injected) return { data: null, error: { message: injected } };

  if (args.p_grantee_user_id === args.p_granted_by) return rpcError("SELF_GRANT");
  const beat = db.tables.beats.find((row) => row.id === args.p_beat_id);
  if (!beat) return rpcError("BEAT_NOT_FOUND");
  if (beat.ownership_type !== "USER" || beat.owner_id == null) {
    return rpcError("PLATFORM_BEAT");
  }
  if (beat.owner_id !== args.p_granted_by) return rpcError("NOT_BEAT_OWNER");
  if (beat.status !== "PUBLISHED") return rpcError("BEAT_NOT_PUBLISHED");
  if (!db.tables.profiles.some((row) => row.id === args.p_grantee_user_id)) {
    return rpcError("GRANTEE_NOT_FOUND");
  }
  const expiresAt = args.p_expires_at as string | null;
  if (expiresAt != null && Date.parse(expiresAt) <= Date.now()) {
    return rpcError("INVALID_EXPIRY");
  }
  const existing = db.tables.beat_access_grants.find(
    (row) =>
      row.beat_id === args.p_beat_id &&
      row.grantee_user_id === args.p_grantee_user_id &&
      row.revoked_at == null,
  );
  if (existing) return rpcError("ACTIVE_GRANT_EXISTS");

  const id = crypto.randomUUID();
  db.tables.beat_access_grants.push({
    id,
    beat_id: args.p_beat_id,
    grantee_user_id: args.p_grantee_user_id,
    granted_by: args.p_granted_by,
    can_record: true,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    revoked_at: null,
  });
  return { data: id, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: db.viewer ? { id: db.viewer, email: "v@x.test" } : null },
        error: null,
      }),
    },
    // Session reads only (profile + role permissions); not recorded.
    from: (table: string) => {
      const data =
        table === "profiles" && db.viewer
          ? [
              {
                id: db.viewer,
                display_name: "Viewer",
                user_number: 5,
                role: "USER",
                account_level: "BEGINNER_RAPPER",
                experience_total: 0,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ]
          : [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        single: async () => ({ data: data[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data, error: null }),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => adminQuery(table),
    rpc: createGrantRpc,
  }),
}));

vi.mock("@/lib/supabase/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/env")>(
    "@/lib/supabase/env",
  );
  return {
    ...actual,
    getSupabasePublicEnv: () => ({
      url: "http://fake",
      anonKey: "anon",
      isConfigured: true,
    }),
  };
});

const { BEAT_ACTION_INTERNAL_ERROR } = await import(
  "@/lib/beats/beat-operation-error"
);
const grantsRoute = await import("@/app/api/beats/[id]/grants/route");
const revokeRoute = await import(
  "@/app/api/beats/[id]/grants/[grantId]/revoke/route"
);
const accountGrantsRoute = await import("@/app/api/account/grants/route");
const { toUserFacingGrantError } = await import("@/lib/ui/user-errors");

function grantRow(overrides: Row = {}): Row {
  return {
    id: GRANT,
    beat_id: BEAT,
    grantee_user_id: GRANTEE,
    granted_by: OWNER,
    can_record: true,
    created_at: "2026-01-01T00:00:00Z",
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const revokeCtx = (id: string, grantId: string) => ({
  params: Promise.resolve({ id, grantId }),
});

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function read(response: Response) {
  return { status: response.status, body: (await response.json()) as Row };
}

const createGrant = (body: unknown, beatId = BEAT) =>
  grantsRoute.POST(post(body), ctx(beatId)).then(read);
const listGrants = (beatId = BEAT) =>
  grantsRoute.GET(new Request("http://localhost/api"), ctx(beatId)).then(read);
const revoke = (beatId = BEAT, grantId = GRANT) =>
  revokeRoute.POST(new Request("http://localhost/api", { method: "POST" }), revokeCtx(beatId, grantId)).then(read);

const tableOps = (table: string) => db.ops.filter((op) => op.table === table);
const writes = () => db.ops.filter((op) => op.op !== "select");
const future = () => new Date(Date.now() + 86_400_000).toISOString();

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.viewer = OWNER;
  db.tables = {
    beats: [
      { id: BEAT, owner_id: OWNER, ownership_type: "USER", status: "PUBLISHED", title: "Mine" },
      { id: OTHER_BEAT, owner_id: OWNER, ownership_type: "USER", status: "PUBLISHED", title: "Other" },
    ],
    profiles: [
      { id: OWNER, display_name: "owner" },
      { id: STRANGER, display_name: "stranger" },
      { id: GRANTEE, display_name: "grantee" },
    ],
    beat_access_grants: [],
  };
  db.ops = [];
  db.failWhen = null;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("grants API — authentication and ids (no data access on rejection)", () => {
  it("anonymous → 401 on list, create and revoke; no query", async () => {
    db.viewer = null;
    for (const result of [
      await listGrants(),
      await createGrant({ grantee: "grantee" }),
      await revoke(),
    ]) {
      expect(result.status).toBe(401);
      expect(result.body.code).toBe("UNAUTHENTICATED");
    }
    expect(db.ops).toEqual([]);
  });

  it.each(["not-a-uuid", "1", "33333333-3333-4333-8333-33333333333Z"])(
    "malformed beat id %s → 400 INVALID before any query",
    async (beatId) => {
      for (const result of [
        await listGrants(beatId),
        await createGrant({ grantee: "grantee" }, beatId),
        await revoke(beatId, GRANT),
      ]) {
        expect(result.status).toBe(400);
        expect(result.body.code).toBe("INVALID");
        expect(JSON.stringify(result.body)).not.toMatch(/22P02|syntax/i);
      }
      expect(db.ops).toEqual([]);
    },
  );

  it("malformed grant id → 400 INVALID before any query", async () => {
    const result = await revoke(BEAT, "grant-1");
    expect(result).toMatchObject({ status: 400, body: { code: "INVALID" } });
    expect(db.ops).toEqual([]);
  });

  it.each(["{not json", "[]", '"grantee"', "null"])(
    "body %s → 400 without parser text, no query",
    async (raw) => {
      const result = await createGrant(raw);
      expect(result).toEqual({
        status: 400,
        body: { error: "JSON object body is required.", code: "INVALID" },
      });
      expect(db.ops).toEqual([]);
    },
  );

  it("missing grantee → 400, no query", async () => {
    const result = await createGrant({ grantee: "   " });
    expect(result.status).toBe(400);
    expect(db.ops).toEqual([]);
  });

  it("client privilege fields → 403 before any query", async () => {
    const result = await createGrant({ grantee: "grantee", canRecord: true });
    expect(result.status).toBe(403);
    expect(db.ops).toEqual([]);
  });
});

describe("grants API — ownership before grantee lookup", () => {
  it.each(["grantee", "nobody-with-this-name", GRANTEE, "99999999-9999-4999-8999-999999999999"])(
    "non-owner creating with grantee %s → same 403, profiles never queried, nothing written",
    async (grantee) => {
      db.viewer = STRANGER;
      const result = await createGrant({ grantee, expiresAt: future() });
      expect(result).toEqual({
        status: 403,
        body: { error: "Only the beat owner may manage grants.", code: "FORBIDDEN" },
      });
      expect(tableOps("profiles")).toEqual([]);
      expect(writes()).toEqual([]);
    },
  );

  it("non-owner list → 403, grants never read", async () => {
    db.viewer = STRANGER;
    db.tables.beat_access_grants.push(grantRow());
    const result = await listGrants();
    expect(result.status).toBe(403);
    expect(tableOps("beat_access_grants")).toEqual([]);
  });

  it("owner: lookup happens after the beat check, then the RPC", async () => {
    const result = await createGrant({ grantee: "grantee" });
    expect(result.status).toBe(200);
    expect(db.ops.map((op) => op.table)).toEqual([
      "beats",
      "profiles",
      "rpc:create_beat_access_grant",
    ]);
  });

  it("owner: create by display name or uuid, then list shows it", async () => {
    expect((await createGrant({ grantee: "grantee" })).status).toBe(200);
    expect(db.tables.beat_access_grants).toHaveLength(1);
    expect(db.tables.beat_access_grants[0]).toMatchObject({
      grantee_user_id: GRANTEE,
      granted_by: OWNER,
      can_record: true,
    });

    expect((await createGrant({ granteeUserId: STRANGER })).status).toBe(200);
    const list = await listGrants();
    expect(list.status).toBe(200);
    expect((list.body.grants as Row[]).map((g) => g.granteeUserId).sort()).toEqual(
      [GRANTEE, STRANGER].sort(),
    );
  });

  it("owner: unknown grantee (uuid or name) → 404, nothing written", async () => {
    for (const grantee of ["99999999-9999-4999-8999-999999999999", "not-a-uuid"]) {
      const result = await createGrant({ grantee });
      expect(result).toEqual({
        status: 404,
        body: { error: "Grantee user not found.", code: "NOT_FOUND" },
      });
    }
    expect(writes()).toEqual([]);
  });

  it("owner: ambiguous display name → 400 (request error, not a permission denial)", async () => {
    db.tables.profiles.push({ id: OTHER_GRANT, display_name: "grantee" });
    const result = await createGrant({ grantee: "grantee" });
    expect(result).toMatchObject({ status: 400, body: { code: "INVALID" } });
    expect(writes()).toEqual([]);
  });
});

describe("grants API — expiresAt", () => {
  it.each([
    ["past", "2000-01-01T00:00:00.000Z", "expiresAt must be a future ISO timestamp."],
    ["unparsable", "tomorrow", "expiresAt must be a future ISO timestamp."],
    ["non-string", 123, "expiresAt must be an ISO string or null."],
  ])("%s expiresAt → 400 INVALID before any query", async (_label, expiresAt, message) => {
    const result = await createGrant({ grantee: "grantee", expiresAt });
    expect(result).toEqual({ status: 400, body: { error: message, code: "INVALID" } });
    expect(db.ops).toEqual([]);
  });

  it("current instant → 400 (must be strictly in the future)", async () => {
    const result = await createGrant({
      grantee: "grantee",
      expiresAt: new Date().toISOString(),
    });
    expect(result.status).toBe(400);
    expect(db.ops).toEqual([]);
  });

  it("future expiresAt → created with the normalized timestamp", async () => {
    const expiresAt = future();
    const result = await createGrant({ grantee: "grantee", expiresAt });
    expect(result.status).toBe(200);
    expect(db.tables.beat_access_grants[0].expires_at).toBe(expiresAt);
  });

  it.each([null, ""])("expiresAt %j → no expiry", async (expiresAt) => {
    const result = await createGrant({ grantee: "grantee", expiresAt });
    expect(result.status).toBe(200);
    expect(db.tables.beat_access_grants[0].expires_at).toBeNull();
  });

  it("expiry passing between app check and RPC (INVALID_EXPIRY) → 400", async () => {
    db.failWhen = (op) => (op.op === "rpc" ? "INVALID_EXPIRY" : null);
    const result = await createGrant({ grantee: "grantee", expiresAt: future() });
    expect(result).toEqual({
      status: 400,
      body: { error: "expiresAt must be in the future.", code: "INVALID" },
    });
  });
});

describe("grants API — domain errors, conflicts and infrastructure failures", () => {
  it("self grant → 403 domain message, no RPC", async () => {
    const result = await createGrant({ grantee: "owner" });
    expect(result).toEqual({
      status: 403,
      body: { error: "Cannot grant access to yourself.", code: "FORBIDDEN" },
    });
    expect(tableOps("rpc:create_beat_access_grant")).toEqual([]);
  });

  it("beat not PUBLISHED → 403 domain message from the RPC", async () => {
    db.tables.beats[0].status = "DRAFT";
    const result = await createGrant({ grantee: "grantee" });
    expect(result).toEqual({
      status: 403,
      body: { error: "Grants are only allowed on PUBLISHED beats.", code: "FORBIDDEN" },
    });
  });

  it("second active grant for the same user → 409 CONFLICT", async () => {
    expect((await createGrant({ grantee: "grantee" })).status).toBe(200);
    const result = await createGrant({ grantee: "grantee" });
    expect(result).toEqual({
      status: 409,
      body: { error: "An active grant already exists for this user.", code: "CONFLICT" },
    });
    expect(db.tables.beat_access_grants).toHaveLength(1);
  });

  it.each([
    ["beats read", (op: { table: string }) => op.table === "beats"],
    ["profile lookup", (op: { table: string }) => op.table === "profiles"],
    ["unknown RPC error", (op: { op: string }) => op.op === "rpc"],
  ])("%s failure → 500 generic, logged, raw text hidden", async (_label, when) => {
    db.failWhen = (op) => (when(op as never) ? RAW_DB_ERROR : null);
    const result = await createGrant({ grantee: "grantee" });
    expect(result).toEqual({
      status: 500,
      body: { error: BEAT_ACTION_INTERNAL_ERROR, code: "INTERNAL" },
    });
    expect(JSON.stringify(result.body)).not.toMatch(/db\.internal|password|token/);
    expect(consoleError).toHaveBeenCalledWith(
      "[api/beats/[id]/grants POST] unexpected error",
      expect.objectContaining({ message: RAW_DB_ERROR }),
    );
  });

  it("list read failure → 500 generic", async () => {
    db.failWhen = (op) => (op.table === "beat_access_grants" ? RAW_DB_ERROR : null);
    const result = await listGrants();
    expect(result).toEqual({
      status: 500,
      body: { error: BEAT_ACTION_INTERNAL_ERROR, code: "INTERNAL" },
    });
  });
});

describe("grants API — revoke", () => {
  beforeEach(() => {
    db.tables.beat_access_grants.push(
      grantRow(),
      grantRow({ id: OTHER_GRANT, beat_id: OTHER_BEAT }),
    );
  });

  it("owner revokes → 200 and revoked_at set", async () => {
    const result = await revoke();
    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(db.tables.beat_access_grants[0].revoked_at).toEqual(expect.any(String));
  });

  it("non-owner → 403, grant never read or updated", async () => {
    db.viewer = STRANGER;
    const result = await revoke();
    expect(result.status).toBe(403);
    expect(tableOps("beat_access_grants")).toEqual([]);
    expect(db.tables.beat_access_grants[0].revoked_at).toBeNull();
  });

  it("grant of another beat → 404, nothing updated", async () => {
    const result = await revoke(BEAT, OTHER_GRANT);
    expect(result).toEqual({
      status: 404,
      body: { error: "Grant not found.", code: "NOT_FOUND" },
    });
    expect(writes()).toEqual([]);
  });

  it("repeated revoke is idempotent: 200 again, no second write", async () => {
    await revoke();
    const firstRevokedAt = db.tables.beat_access_grants[0].revoked_at;
    db.ops = [];
    const again = await revoke();
    expect(again).toEqual({ status: 200, body: { success: true } });
    expect(writes()).toEqual([]);
    expect(db.tables.beat_access_grants[0].revoked_at).toBe(firstRevokedAt);
  });

  it("update failure → 500 generic, logged", async () => {
    db.failWhen = (op) => (op.op === "update" ? RAW_DB_ERROR : null);
    const result = await revoke();
    expect(result.status).toBe(500);
    expect(result.body.error).toBe(BEAT_ACTION_INTERNAL_ERROR);
    expect(consoleError).toHaveBeenCalledWith(
      "[api/beats/[id]/grants/[grantId]/revoke] unexpected error",
      expect.any(Error),
    );
  });
});

describe("/api/account/grants (grantee list)", () => {
  it("anonymous → 401, no query", async () => {
    db.viewer = null;
    const result = await read(await accountGrantsRoute.GET());
    expect(result.status).toBe(401);
    expect(db.ops).toEqual([]);
  });

  it("grantee sees active grants", async () => {
    db.viewer = GRANTEE;
    db.tables.beat_access_grants.push(grantRow());
    const result = await read(await accountGrantsRoute.GET());
    expect(result.status).toBe(200);
    expect(result.body.grants).toEqual([
      expect.objectContaining({ id: GRANT, beatId: BEAT, beatTitle: "Mine" }),
    ]);
  });

  it("DB failure → 500 generic, raw text hidden", async () => {
    db.viewer = GRANTEE;
    db.failWhen = () => RAW_DB_ERROR;
    const result = await read(await accountGrantsRoute.GET());
    expect(result).toEqual({
      status: 500,
      body: { error: BEAT_ACTION_INTERNAL_ERROR, code: "INTERNAL" },
    });
  });
});

describe("grants panel contract (`!res.ok` → toUserFacingGrantError(json.error))", () => {
  it.each([
    [{ grantee: "grantee", expiresAt: "2000-01-01T00:00:00.000Z" }, "Data wygaśnięcia musi być w przyszłości."],
    [{ grantee: "nobody" }, "Nie znaleziono użytkownika."],
    [{ grantee: "owner" }, "Nie możesz przyznać dostępu samemu sobie."],
  ])("%j → Polish message", async (body, expected) => {
    const result = await createGrant(body);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(toUserFacingGrantError(result.body.error as string)).toBe(expected);
  });

  it("conflict and infrastructure failures stay readable and safe", async () => {
    await createGrant({ grantee: "grantee" });
    const conflict = await createGrant({ grantee: "grantee" });
    expect(toUserFacingGrantError(conflict.body.error as string)).toBe(
      "Ten użytkownik ma już aktywny dostęp.",
    );

    db.failWhen = () => RAW_DB_ERROR;
    const failed = await createGrant({ grantee: "grantee" });
    expect(toUserFacingGrantError(failed.body.error as string)).toBe(
      BEAT_ACTION_INTERNAL_ERROR,
    );
  });

  it("non-owner sees the owner message", async () => {
    db.viewer = STRANGER;
    const result = await createGrant({ grantee: "grantee" });
    expect(toUserFacingGrantError(result.body.error as string)).toBe(
      "Tylko właściciel bitu może zarządzać dostępem.",
    );
  });
});
