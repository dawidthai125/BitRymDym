/**
 * Security Audit Wave 2 — role matrix of `/api/admin/beats/**`, end to end in
 * process: real route handlers, error mapper, audio transport, beats service
 * and permission checks. Only the Supabase clients (recording fakes that also
 * serve the session profile + role permissions) and the audio decoder are
 * faked. Every denial must leave no beat/asset/storage operation behind.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BEAT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_BEAT_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";
const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const DB_MESSAGE =
  'permission denied for table beat_audio_assets (SQLSTATE 42501)';

type Role = "USER" | "MODERATOR" | "ADMIN";
type Op = {
  client: "server" | "admin";
  target: string;
  op: string;
  payload?: unknown;
  filters: [string, unknown][];
};

const state = vi.hoisted(() => ({
  viewer: null as null | { role: string; permissions: string[] },
  beat: null as Record<string, unknown> | null,
  asset: null as Record<string, unknown> | null,
  failTable: null as string | null,
  storageDownloadError: null as string | null,
  ops: [] as {
    client: "server" | "admin";
    target: string;
    op: string;
    payload?: unknown;
    filters: [string, unknown][];
  }[],
}));

function queryBuilder(client: "server" | "admin", table: string) {
  const entry: Op = { client, target: table, op: "select", filters: [] };
  const isSessionRead =
    client === "server" &&
    (table === "profiles" || table === "role_permissions");
  if (!isSessionRead) state.ops.push(entry);

  const resolveRows = (): { data: unknown; error: unknown } => {
    if (state.failTable === table) {
      return { data: null, error: { message: DB_MESSAGE } };
    }
    if (table === "profiles") {
      const viewer = state.viewer;
      return {
        data: viewer
          ? {
              id: VIEWER_ID,
              display_name: "Viewer",
              user_number: 7,
              role: viewer.role,
              account_level: "BEGINNER_RAPPER",
              experience_total: 0,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }
          : null,
        error: null,
      };
    }
    if (table === "role_permissions") {
      return {
        data: (state.viewer?.permissions ?? []).map((key) => ({
          permissions: { key },
        })),
        error: null,
      };
    }
    if (table === "beats") {
      const row =
        entry.op === "insert"
          ? { ...state.beat, ...(entry.payload as object) }
          : entry.op === "update"
            ? { ...state.beat, ...(entry.payload as object) }
            : state.beat;
      return { data: row, error: null };
    }
    if (table === "beat_audio_assets") {
      if (entry.op === "select") return { data: state.asset, error: null };
      return {
        data: { ...state.asset, ...(entry.payload as object) },
        error: null,
      };
    }
    return { data: null, error: null };
  };

  const builder = {
    select: () => builder,
    insert: (payload: unknown) => {
      entry.op = "insert";
      entry.payload = payload;
      return builder;
    },
    update: (payload: unknown) => {
      entry.op = "update";
      entry.payload = payload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      entry.filters.push([column, value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      entry.filters.push([column, value]);
      return builder;
    },
    maybeSingle: async () => resolveRows(),
    single: async () => resolveRows(),
    then: (resolve: (value: unknown) => unknown) => {
      const result = resolveRows();
      return resolve(
        Array.isArray(result.data) || result.data === null
          ? result
          : { ...result, data: [result.data] },
      );
    },
  };
  return builder;
}

function fakeStorage(client: "server" | "admin") {
  return {
    from: (bucket: string) => ({
      download: async (key: string) => {
        state.ops.push({
          client,
          target: `storage:${bucket}`,
          op: "download",
          payload: key,
          filters: [],
        });
        if (state.storageDownloadError) {
          return { data: null, error: { message: state.storageDownloadError } };
        }
        return { data: new Blob([new Uint8Array(4096)]), error: null };
      },
      createSignedUploadUrl: async (key: string) => {
        state.ops.push({
          client,
          target: `storage:${bucket}`,
          op: "createSignedUploadUrl",
          payload: key,
          filters: [],
        });
        return {
          data: { path: key, token: "token", signedUrl: `https://signed/${key}` },
          error: null,
        };
      },
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.viewer ? { id: VIEWER_ID, email: "v@x.test" } : null },
        error: null,
      }),
    },
    from: (table: string) => queryBuilder("server", table),
    storage: fakeStorage("server"),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => queryBuilder("admin", table),
    // Contract stand-in for finalize_beat_master_asset (real one: local Postgres suite).
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.ops.push({ client: "admin", target: `rpc:${fn}`, op: "rpc", payload: args, filters: [] });
      if (state.asset?.status !== "PENDING_UPLOAD") {
        return { data: null, error: { message: "ALREADY_FINALIZED", code: "P0001" } };
      }
      return {
        data: {
          beat_id: args.p_beat_id,
          asset: { ...state.asset, status: "READY", is_active: true },
          replaced_asset_id: null,
          idempotent_replay: false,
        },
        error: null,
      };
    },
    storage: fakeStorage("admin"),
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

vi.mock("@/lib/beats/audio-duration", () => ({
  probeAudioDurationFromBytes: async () => ({
    ok: true,
    durationSeconds: 150,
    durationRawSeconds: 150,
  }),
  analyzeBeatAudioBytes: async (params: {
    bytes: Uint8Array;
    contentType: string;
  }) => {
    const bpm = {
      status: "unavailable",
      reason: "test",
      message: "BPM unavailable in tests.",
    };
    return {
      ok: true,
      durationSeconds: 95,
      byteSize: params.bytes.byteLength,
      contentType: params.contentType,
      titleSuggestion: "",
      bpm,
      bpmProbe: bpm,
    };
  },
}));

const { BEAT_AUDIO_INTERNAL_ERROR } = await import(
  "@/lib/beats/beat-operation-error"
);
const analyzeRoute = await import("@/app/api/admin/beats/audio/analyze/route");
const sessionRoute = await import("@/app/api/admin/beats/audio/session/route");
const masterRoute = await import("@/app/api/admin/beats/[id]/master/route");

const ADMIN_ALL = [
  "beats.create",
  "beats.edit",
  "beats.delete",
  "beats.approve",
  "beats.reject",
  "beats.publish",
];

const VIEWERS: Record<
  string,
  null | { role: Role; permissions: string[] }
> = {
  anonymous: null,
  USER: { role: "USER", permissions: ["beats.create"] },
  MODERATOR: {
    role: "MODERATOR",
    permissions: ["beats.approve", "beats.reject", "beats.publish"],
  },
  "ADMIN without beats.create": {
    role: "ADMIN",
    permissions: ADMIN_ALL.filter((key) => key !== "beats.create"),
  },
  "ADMIN without beats.edit": {
    role: "ADMIN",
    permissions: ADMIN_ALL.filter((key) => key !== "beats.edit"),
  },
};

function beatRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BEAT_ID,
    owner_id: null,
    ownership_type: "PLATFORM",
    title: "Platform beat",
    producer: null,
    description: null,
    genre: null,
    style: null,
    bpm: 1,
    key: null,
    scale: null,
    duration_seconds: 1,
    tags: [],
    cover_ref: null,
    status: "DRAFT",
    rejection_reason: null,
    last_submitted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    beat_id: BEAT_ID,
    purpose: "MASTER",
    status: "PENDING_UPLOAD",
    storage_bucket: "beat-audio",
    object_key: `platform/${BEAT_ID}/master/${ASSET_ID}.wav`,
    content_type: "audio/wav",
    byte_size: 4096,
    checksum_sha256: null,
    original_filename: "beat.wav",
    is_active: false,
    replaced_by_asset_id: null,
    created_by: VIEWER_ID,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const masterParams = { params: Promise.resolve({ id: BEAT_ID }) };

const ROUTES = {
  session: () =>
    sessionRoute.POST(
      post({ contentType: "audio/wav", byteSize: 4096, originalFilename: "a.wav" }),
    ),
  analyze: () =>
    analyzeRoute.POST(post({ beatId: BEAT_ID, assetId: ASSET_ID })),
  "master session": () =>
    masterRoute.POST(
      post({ action: "session", contentType: "audio/wav", byteSize: 4096 }),
      masterParams,
    ),
  "master complete": () =>
    masterRoute.POST(post({ action: "complete", assetId: ASSET_ID }), masterParams),
};
type RouteName = keyof typeof ROUTES;

/** Permission each route needs beyond the ADMIN role. */
const REQUIRED: Record<RouteName, string[]> = {
  session: ["beats.create"],
  analyze: ["beats.create", "beats.edit"],
  "master session": ["beats.edit"],
  "master complete": ["beats.edit"],
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.viewer = { role: "ADMIN", permissions: ADMIN_ALL };
  state.beat = beatRow();
  state.asset = assetRow();
  state.failTable = null;
  state.storageDownloadError = null;
  state.ops = [];
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

async function call(route: RouteName) {
  const response = await ROUTES[route]();
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

const writes = () => state.ops.filter((op) => op.op !== "select");

describe.each(Object.keys(ROUTES) as RouteName[])("%s route — role matrix", (route) => {
  it("anonymous → 401 UNAUTHENTICATED, no beat/asset/storage operation", async () => {
    state.viewer = null;
    const { status, body } = await call(route);
    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(state.ops).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each(["USER", "MODERATOR"])(
    "%s → 403 FORBIDDEN, no beat/asset/storage operation",
    async (who) => {
      state.viewer = VIEWERS[who]!;
      const { status, body } = await call(route);
      expect(status).toBe(403);
      expect(body.code).toBe("FORBIDDEN");
      expect(state.ops).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it.each(["ADMIN without beats.create", "ADMIN without beats.edit"])(
    "%s → 403 when the route needs it, no operation",
    async (who) => {
      const viewer = VIEWERS[who]!;
      const missing = ADMIN_ALL.find((key) => !viewer.permissions.includes(key))!;
      if (!REQUIRED[route].includes(missing)) return;
      state.viewer = viewer;
      const { status, body } = await call(route);
      expect(status).toBe(403);
      expect(body).toEqual({ error: "Missing permission.", code: "FORBIDDEN" });
      expect(state.ops).toEqual([]);
    },
  );
});

describe("ADMIN with permission — success paths", () => {
  it("session creates DRAFT + PENDING_UPLOAD asset + signed URL", async () => {
    const { status, body } = await call("session");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(writes().map((op) => `${op.client}:${op.target}:${op.op}`)).toEqual([
      "server:beats:insert",
      "admin:beat_audio_assets:insert",
      "admin:storage:beat-audio:createSignedUploadUrl",
    ]);
  });

  it("analyze reads the uploaded object and updates only the pending asset (no beat write — Security Wave 5)", async () => {
    const { status, body } = await call("analyze");
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, durationSeconds: 95 });
    expect(writes().map((op) => `${op.client}:${op.target}:${op.op}`)).toEqual([
      "admin:storage:beat-audio:download",
      "admin:beat_audio_assets:update",
    ]);
    expect(writes()[1].filters).toEqual([
      ["id", ASSET_ID],
      ["status", "PENDING_UPLOAD"],
    ]);
  });

  it("master complete activates the pending MASTER through one RPC with the measured duration", async () => {
    const { status, body } = await call("master complete");
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, assetId: ASSET_ID, status: "READY" });
    expect(writes().map((op) => `${op.client}:${op.target}:${op.op}`)).toEqual([
      "admin:storage:beat-audio:download",
      "admin:rpc:finalize_beat_master_asset:rpc",
    ]);
    expect(writes()[1].payload).toMatchObject({
      p_beat_id: BEAT_ID,
      p_asset_id: ASSET_ID,
      p_ownership_type: "PLATFORM",
      p_owner_id: null,
      p_apply_metadata: false,
      p_duration_seconds: 150,
    });
  });
});

describe("ADMIN with permission — resource and binding checks", () => {
  it.each(["analyze", "master session", "master complete"] as RouteName[])(
    "%s: missing beat → 404, nothing written",
    async (route) => {
      state.beat = null;
      const { status, body } = await call(route);
      expect(status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
      expect(writes()).toEqual([]);
    },
  );

  it.each(["analyze", "master session", "master complete"] as RouteName[])(
    "%s: USER-owned beat → 403, nothing written",
    async (route) => {
      state.beat = beatRow({ ownership_type: "USER", owner_id: VIEWER_ID });
      const { status, body } = await call(route);
      expect(status).toBe(403);
      expect(body.code).toBe("FORBIDDEN");
      expect(writes()).toEqual([]);
    },
  );

  it.each(["analyze", "master complete"] as RouteName[])(
    "%s: missing asset → 404, nothing written",
    async (route) => {
      state.asset = null;
      const { status, body } = await call(route);
      expect(status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
      expect(writes()).toEqual([]);
    },
  );

  it.each(["analyze", "master complete"] as RouteName[])(
    "%s: asset of another beat → 403, no storage read or write",
    async (route) => {
      state.asset = assetRow({ beat_id: OTHER_BEAT_ID });
      const { status, body } = await call(route);
      expect(status).toBe(403);
      expect(body).toEqual({
        error: "Asset does not belong to beat.",
        code: "FORBIDDEN",
      });
      expect(writes()).toEqual([]);
    },
  );

  it.each([
    ["analyze", { status: "READY", is_active: true }],
    ["master complete", { status: "READY", is_active: false }],
    ["master complete", { status: "REPLACED" }],
    ["master complete", { status: "FAILED" }],
    ["master complete", { purpose: "PLAYBACK" }],
  ] as [RouteName, Record<string, unknown>][])(
    "%s: asset %o → 409 CONFLICT, no storage read or write",
    async (route, overrides) => {
      state.asset = assetRow(overrides);
      const { status, body } = await call(route);
      expect(status).toBe(409);
      expect(body.code).toBe("CONFLICT");
      expect(writes()).toEqual([]);
    },
  );

  it("master complete on the active READY MASTER (retry) is decided by the RPC: refusal → 409, no direct write", async () => {
    state.asset = assetRow({ status: "READY", is_active: true });
    const { status, body } = await call("master complete");
    expect(status).toBe(409);
    expect(body).toEqual({ error: "Asset is not a pending MASTER upload.", code: "CONFLICT" });
    expect(writes().map((op) => `${op.client}:${op.target}:${op.op}`)).toEqual([
      "admin:storage:beat-audio:download",
      "admin:rpc:finalize_beat_master_asset:rpc",
    ]);
  });
});

describe("ADMIN with permission — infrastructure errors", () => {
  it.each(Object.keys(ROUTES) as RouteName[])(
    "%s: database failure → 500 INTERNAL with a generic message and a server log",
    async (route) => {
      state.failTable = "beat_audio_assets";
      const { status, body } = await call(route);
      expect(status).toBe(500);
      expect(body).toEqual({
        error: BEAT_AUDIO_INTERNAL_ERROR,
        code: "INTERNAL",
      });
      expect(JSON.stringify(body)).not.toContain("SQLSTATE");
      expect(consoleError).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["analyze", "master complete"] as RouteName[])(
    "%s: storage failure → 500 INTERNAL without the storage message",
    async (route) => {
      state.storageDownloadError = "Object not found: s3://internal-bucket/key";
      const { status, body } = await call(route);
      expect(status).toBe(500);
      expect(body).toEqual({
        error: BEAT_AUDIO_INTERNAL_ERROR,
        code: "INTERNAL",
      });
      expect(consoleError).toHaveBeenCalledTimes(1);
    },
  );
});
