/**
 * Security Audit Wave 3 / Security Wave 5 — audio asset lifecycle in process:
 * real USER / ADMIN routes, real finalize server actions, real transport, beats
 * service and permission checks against a stateful fake database that applies
 * filters and returns only matched rows. Only the audio decoder and the BPM
 * policy are faked (not under test).
 *
 * `finalize_beat_master_asset` is replaced by a small in-memory model of its
 * contract so flows can run end to end. These tests prove the application side
 * (authorization before the RPC, exact RPC arguments, error mapping, no direct
 * beat / activation writes). Atomicity, locking and rollback are proven against
 * real Postgres in beat-master-finalize-local.test.ts, not here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBeatAudioObjectKey,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";

type Row = Record<string, unknown>;
type Filter = [column: string, kind: "eq" | "in", value: unknown];
type Op = {
  client: "server" | "admin";
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: Row;
  filters: Filter[];
};

const VIEWER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const BEAT = "33333333-3333-4333-8333-333333333333";
const NEW_ASSET = "44444444-4444-4444-8444-444444444444";
const OLD_ASSET = "66666666-6666-4666-8666-666666666666";
const SECOND_ASSET = "77777777-7777-4777-8777-777777777777";

const db = vi.hoisted(() => ({
  viewer: null as null | { role: string; permissions: string[] },
  tables: { beats: [] as Row[], beat_audio_assets: [] as Row[] } as Record<
    string,
    Row[]
  >,
  ops: [] as {
    client: "server" | "admin";
    table: string;
    op: "select" | "insert" | "update" | "delete";
    payload?: Record<string, unknown>;
    filters: [string, "eq" | "in", unknown][];
  }[],
  storage: [] as { op: string; key: string }[],
  objects: new Set<string>(),
  /** Return an error message to fail this statement. */
  failWhen: null as
    | null
    | ((op: {
        table: string;
        op: string;
        payload?: Record<string, unknown>;
        filters: [string, "eq" | "in", unknown][];
      }) => string | null),
  /** Mutate state right before a write executes (concurrent request). */
  beforeWrite: null as
    | null
    | ((op: {
        table: string;
        op: string;
        payload?: Record<string, unknown>;
        filters: [string, "eq" | "in", unknown][];
      }) => void),
  analysis: "ok" as "ok" | string,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  /** Return an RPC error instead of running the model. */
  rpcError: null as null | { message: string; code: string },
}));

/** In-memory model of finalize_beat_master_asset (see migration 20261017140000). */
function finalizeRpcModel(a: Record<string, unknown>): {
  data: unknown;
  error: { message: string; code: string } | null;
} {
  const fail = (token: string) => ({ data: null, error: { message: token, code: "P0001" } });
  const beat = db.tables.beats.find((row) => row.id === a.p_beat_id);
  if (!beat) return fail("BEAT_NOT_FOUND");
  if (
    beat.ownership_type !== a.p_ownership_type ||
    (beat.owner_id ?? null) !== a.p_owner_id ||
    (a.p_ownership_type === "USER" && !["DRAFT", "REJECTED"].includes(beat.status as string))
  ) {
    return fail("BEAT_CHANGED");
  }
  const asset = db.tables.beat_audio_assets.find((row) => row.id === a.p_asset_id);
  if (!asset) return fail("ASSET_NOT_FOUND");
  if (asset.beat_id !== a.p_beat_id) return fail("ASSET_BEAT_MISMATCH");
  if (asset.purpose !== "MASTER") return fail("NOT_PENDING_MASTER");

  const metadata = a.p_apply_metadata
    ? {
        title: a.p_title,
        producer: a.p_producer,
        description: a.p_description,
        genre: a.p_genre,
        style: a.p_style,
        bpm: a.p_bpm,
        key: a.p_key,
        scale: a.p_scale,
        tags: a.p_tags,
        cover_ref: a.p_cover_ref,
      }
    : {};
  const result = (replaced: string | null, replay: boolean) => ({
    data: { beat_id: beat.id, asset: { ...asset }, replaced_asset_id: replaced, idempotent_replay: replay },
    error: null,
  });

  if (asset.status === "READY" && asset.is_active) {
    const same =
      asset.checksum_sha256 === a.p_checksum_sha256 &&
      asset.byte_size === a.p_byte_size &&
      asset.content_type === a.p_content_type &&
      beat.duration_seconds === a.p_duration_seconds &&
      Object.entries(metadata).every(
        ([key, value]) => JSON.stringify(beat[key]) === JSON.stringify(value),
      );
    return same ? result(null, true) : fail("ALREADY_FINALIZED");
  }
  if (asset.status !== "PENDING_UPLOAD") return fail("NOT_PENDING_MASTER");

  const previous = db.tables.beat_audio_assets.find(
    (row) => row.beat_id === a.p_beat_id && row.purpose === "MASTER" && row.is_active,
  );
  if (previous) {
    Object.assign(previous, {
      is_active: false,
      status: "REPLACED",
      replaced_by_asset_id: asset.id,
    });
  }
  Object.assign(asset, {
    status: "READY",
    is_active: true,
    content_type: a.p_content_type,
    byte_size: a.p_byte_size,
    checksum_sha256: a.p_checksum_sha256,
  });
  Object.assign(beat, metadata, { duration_seconds: a.p_duration_seconds });
  return result((previous?.id as string | undefined) ?? null, false);
}

function execute(op: Op): {
  data: Row[] | null;
  error: { message: string; code?: string } | null;
} {
  if (op.client === "server" && op.table === "profiles") {
    const viewer = db.viewer;
    return {
      data: viewer
        ? [
            {
              id: VIEWER,
              display_name: "Viewer",
              user_number: 5,
              role: viewer.role,
              account_level: "BEGINNER_RAPPER",
              experience_total: 0,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]
        : [],
      error: null,
    };
  }
  if (op.client === "server" && op.table === "role_permissions") {
    return {
      data: (db.viewer?.permissions ?? []).map((key) => ({
        permissions: { key },
      })),
      error: null,
    };
  }

  db.ops.push(op);
  const injected = db.failWhen?.(op);
  if (injected) return { data: null, error: { message: injected } };
  if (op.op !== "select") db.beforeWrite?.(op);

  const rows = db.tables[op.table] ?? [];
  const matches = (row: Row) =>
    op.filters.every(([column, kind, value]) =>
      kind === "eq"
        ? row[column] === value
        : (value as unknown[]).includes(row[column]),
    );

  if (op.op === "select") {
    return { data: rows.filter(matches).map((row) => ({ ...row })), error: null };
  }
  if (op.op === "insert") {
    const row = { id: crypto.randomUUID(), ...op.payload };
    rows.push(row);
    return { data: [{ ...row }], error: null };
  }
  if (op.op === "update") {
    const matched = rows.filter(matches);
    matched.forEach((row) => Object.assign(row, op.payload));
    return { data: matched.map((row) => ({ ...row })), error: null };
  }
  return { data: [], error: null };
}

function queryBuilder(client: "server" | "admin", table: string) {
  const op: Op = { client, table, op: "select", filters: [] };
  const builder = {
    select: () => builder,
    insert: (payload: Row) => {
      op.op = "insert";
      op.payload = payload;
      return builder;
    },
    update: (payload: Row) => {
      op.op = "update";
      op.payload = payload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      op.filters.push([column, "eq", value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      op.filters.push([column, "in", value]);
      return builder;
    },
    maybeSingle: async () => {
      const result = execute(op);
      if (result.error) return { data: null, error: result.error };
      if ((result.data ?? []).length > 1) {
        return { data: null, error: { message: "multiple rows" } };
      }
      return { data: result.data?.[0] ?? null, error: null };
    },
    single: async () => {
      const result = execute(op);
      if (result.error) return { data: null, error: result.error };
      if ((result.data ?? []).length !== 1) {
        return { data: null, error: { message: "expected one row" } };
      }
      return { data: result.data![0], error: null };
    },
    then: (resolve: (value: unknown) => unknown) => resolve(execute(op)),
  };
  return builder;
}

const storageApi = {
  from: () => ({
    download: async (key: string) => {
      db.storage.push({ op: "download", key });
      return db.objects.has(key)
        ? { data: new Blob([new Uint8Array(4096)]), error: null }
        : { data: null, error: { message: `Object not found: s3://beat-audio/${key}` } };
    },
    createSignedUploadUrl: async (key: string) => {
      db.storage.push({ op: "createSignedUploadUrl", key });
      return {
        data: { path: key, token: "signed-token", signedUrl: `https://signed/${key}` },
        error: null,
      };
    },
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: db.viewer ? { id: VIEWER, email: "v@x.test" } : null },
        error: null,
      }),
    },
    from: (table: string) => queryBuilder("server", table),
    storage: storageApi,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => queryBuilder("admin", table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args });
      if (db.rpcError) return { data: null, error: db.rpcError };
      if (fn !== "finalize_beat_master_asset") {
        return { data: null, error: { message: `unknown rpc ${fn}`, code: "42883" } };
      }
      return finalizeRpcModel(args);
    },
    storage: storageApi,
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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/beats/audio-duration", () => ({
  probeAudioDurationFromBytes: async () =>
    db.analysis === "ok"
      ? { ok: true, durationSeconds: 150, durationRawSeconds: 150.2 }
      : { ok: false, error: db.analysis },
  analyzeBeatAudioBytes: async (params: { bytes: Uint8Array; contentType: string }) => {
    if (db.analysis !== "ok") return { ok: false, error: db.analysis };
    const bpm = { status: "unavailable", reason: "test", message: "n/a" };
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

vi.mock("@/lib/beats/bpm-uncertainty", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/beats/bpm-uncertainty")
  >("@/lib/beats/bpm-uncertainty");
  return {
    ...actual,
    resolveCreateBpm: (params: { clientBpm: number }) =>
      params.clientBpm === 0
        ? { ok: false, error: actual.REJECT_SELECTION_REQUIRED }
        : { ok: true, bpm: params.clientBpm, bpmSource: "USER_SELECTED_CANDIDATE" },
  };
});

const { BEAT_AUDIO_INTERNAL_ERROR, BEAT_ACTION_INTERNAL_ERROR } = await import(
  "@/lib/beats/beat-operation-error"
);
const userSessionRoute = await import("@/app/api/beats/audio/session/route");
const userAnalyzeRoute = await import("@/app/api/beats/audio/analyze/route");
const adminMasterRoute = await import("@/app/api/admin/beats/[id]/master/route");
const { finalizeUserBeatWithMasterAction } = await import(
  "@/lib/beats/user-create-with-master"
);
const { finalizePlatformBeatWithMasterAction } = await import(
  "@/lib/beats/create-with-master"
);

const USER_VIEWER = { role: "USER", permissions: ["beats.create"] };
const ADMIN_ALL = [
  "beats.create",
  "beats.edit",
  "beats.delete",
  "beats.approve",
  "beats.reject",
  "beats.publish",
];

function beatRow(overrides: Row = {}): Row {
  return {
    id: BEAT,
    owner_id: VIEWER,
    ownership_type: "USER",
    title: "Draft",
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

function assetRow(id: string, overrides: Row = {}): Row {
  const platform = overrides.platform === true;
  const rest = { ...overrides };
  delete rest.platform;
  return {
    id,
    beat_id: BEAT,
    purpose: "MASTER",
    status: "PENDING_UPLOAD",
    storage_bucket: "beat-audio",
    object_key: platform
      ? buildBeatAudioObjectKey({ beatId: BEAT, assetId: id, purpose: "MASTER" })
      : buildUserBeatAudioObjectKey({
          ownerId: VIEWER,
          beatId: BEAT,
          assetId: id,
          purpose: "MASTER",
        }),
    content_type: "audio/wav",
    byte_size: 4096,
    checksum_sha256: null,
    original_filename: "take.wav",
    is_active: false,
    replaced_by_asset_id: null,
    created_by: VIEWER,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

const asset = (id: string) =>
  db.tables.beat_audio_assets.find((row) => row.id === id)!;
const beat = () => db.tables.beats.find((row) => row.id === BEAT)!;
const writes = () => db.ops.filter((op) => op.op !== "select");
const beatWrites = () => writes().filter((op) => op.table === "beats");
const activationWrites = () =>
  writes().filter(
    (op) =>
      op.table === "beat_audio_assets" &&
      ("is_active" in (op.payload ?? {}) || op.payload?.status === "READY" || op.payload?.status === "REPLACED"),
  );
const rpcArgs = () => {
  expect(db.rpcCalls).toHaveLength(1);
  expect(db.rpcCalls[0].fn).toBe("finalize_beat_master_asset");
  return db.rpcCalls[0].args;
};
const activeMasters = () =>
  db.tables.beat_audio_assets.filter(
    (row) => row.beat_id === BEAT && row.purpose === "MASTER" && row.is_active,
  );

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return { status: response.status, body: (await response.json()) as Row };
}

const finalizeParams = (assetId = NEW_ASSET, bpm = 120) => ({
  beatId: BEAT,
  assetId,
  title: "Final title",
  bpm,
});

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.viewer = USER_VIEWER;
  db.tables.beats = [beatRow()];
  db.tables.beat_audio_assets = [
    assetRow(OLD_ASSET, { status: "READY", is_active: true }),
    assetRow(NEW_ASSET),
  ];
  db.ops = [];
  db.storage = [];
  db.objects = new Set(
    db.tables.beat_audio_assets.map((row) => row.object_key as string),
  );
  db.failWhen = null;
  db.beforeWrite = null;
  db.analysis = "ok";
  db.rpcCalls = [];
  db.rpcError = null;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("USER routes — authentication, permissions, ids (no data or storage access on denial)", () => {
  const calls = {
    session: () =>
      userSessionRoute.POST(
        post({ beatId: BEAT, contentType: "audio/wav", byteSize: 4096 }),
      ),
    analyze: () =>
      userAnalyzeRoute.POST(post({ beatId: BEAT, assetId: NEW_ASSET })),
  };

  it.each(Object.keys(calls) as (keyof typeof calls)[])(
    "%s: anonymous → 401",
    async (name) => {
      db.viewer = null;
      const { status, body } = await json(await calls[name]());
      expect(status).toBe(401);
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(db.ops).toEqual([]);
      expect(db.storage).toEqual([]);
    },
  );

  it.each([
    ["session", { role: "USER", permissions: [] }],
    ["session", { role: "MODERATOR", permissions: ["beats.approve"] }],
    ["session", { role: "ADMIN", permissions: ADMIN_ALL }],
    ["analyze", { role: "USER", permissions: [] }],
    ["analyze", { role: "ADMIN", permissions: ADMIN_ALL }],
  ] as [keyof typeof calls, { role: string; permissions: string[] }][])(
    "%s: %o → 403",
    async (name, viewer) => {
      db.viewer = viewer;
      const { status, body } = await json(await calls[name]());
      expect(status).toBe(403);
      expect(body.code).toBe("FORBIDDEN");
      expect(db.ops).toEqual([]);
      expect(db.storage).toEqual([]);
    },
  );

  it("session: another user's beat → 403, no asset or storage write", async () => {
    db.tables.beats = [beatRow({ owner_id: OTHER_USER })];
    const { status } = await json(await calls.session());
    expect(status).toBe(403);
    expect(writes()).toEqual([]);
    expect(db.storage).toEqual([]);
  });

  it.each([
    ["session", { beatId: "x", contentType: "audio/wav", byteSize: 1 }],
    ["analyze", { beatId: BEAT, assetId: "../../etc" }],
    ["analyze", "{not json"],
  ] as [keyof typeof calls, unknown][])(
    "%s: malformed input %o → 400 before any query",
    async (name, body) => {
      const route =
        name === "session" ? userSessionRoute.POST : userAnalyzeRoute.POST;
      const result = await json(await route(post(body)));
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("INVALID");
      expect(db.ops).toEqual([]);
    },
  );

  it("session: client-chosen object key is still rejected (403), nothing written", async () => {
    const { status } = await json(
      await userSessionRoute.POST(
        post({
          beatId: BEAT,
          contentType: "audio/wav",
          byteSize: 4096,
          objectKey: 123,
        }),
      ),
    );
    expect(status).toBe(403);
    expect(writes()).toEqual([]);
  });
});

describe("USER analyze — error contract and partial writes", () => {
  const analyze = async () =>
    json(await userAnalyzeRoute.POST(post({ beatId: BEAT, assetId: NEW_ASSET })));

  it("success keeps the asset PENDING_UPLOAD and never writes the beat (E1)", async () => {
    const before = { ...beat() };
    const { status, body } = await analyze();
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, durationSeconds: 95 });
    expect(asset(NEW_ASSET).status).toBe("PENDING_UPLOAD");
    expect(beat()).toEqual(before);
    expect(beatWrites()).toEqual([]);
    expect(db.rpcCalls).toEqual([]);
  });

  it("asset size / checksum write is pinned to PENDING_UPLOAD (a concurrently activated asset is not rewritten)", async () => {
    await analyze();
    const assetWrite = writes().find((op) => op.table === "beat_audio_assets");
    expect(assetWrite?.filters).toEqual([
      ["id", "eq", NEW_ASSET],
      ["status", "eq", "PENDING_UPLOAD"],
    ]);
  });

  it.each([
    { status: "READY", is_active: true },
    { status: "REPLACED" },
    { status: "FAILED" },
  ])("asset %o → 409, no storage read or write", async (overrides) => {
    Object.assign(asset(NEW_ASSET), overrides);
    if (overrides.is_active) asset(OLD_ASSET).is_active = false;
    const { status, body } = await analyze();
    expect(status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(writes()).toEqual([]);
    expect(db.storage).toEqual([]);
  });

  it("invalid audio → 400 with the domain message; the asset becomes FAILED", async () => {
    db.analysis = "Plik audio jest pusty.";
    const { status, body } = await analyze();
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Plik audio jest pusty.", code: "INVALID" });
    expect(asset(NEW_ASSET).status).toBe("FAILED");
  });

  it("markAssetFailed write error is logged and never replaces the original error", async () => {
    db.analysis = "Plik audio jest pusty.";
    db.failWhen = (op) =>
      op.table === "beat_audio_assets" && op.payload?.status === "FAILED"
        ? "connection reset"
        : null;
    const { status, body } = await analyze();
    expect(status).toBe(400);
    expect(body.error).toBe("Plik audio jest pusty.");
    expect(asset(NEW_ASSET).status).toBe("PENDING_UPLOAD");
    expect(String(consoleError.mock.calls[0]?.[0])).toContain("markAssetFailed");
  });

  it("storage failure → 500 generic, storage text not exposed, asset FAILED", async () => {
    db.objects.clear();
    const { status, body } = await analyze();
    expect(status).toBe(500);
    expect(body).toEqual({ error: BEAT_AUDIO_INTERNAL_ERROR, code: "INTERNAL" });
    expect(JSON.stringify(body)).not.toContain("s3://");
    expect(asset(NEW_ASSET).status).toBe("FAILED");
    expect(consoleError).toHaveBeenCalledWith(
      "[api/beats/audio/analyze] unexpected error",
      expect.any(Error),
    );
  });

  it("asset write error → 500, never success, beat metadata untouched", async () => {
    db.failWhen = (op) =>
      op.table === "beat_audio_assets" && op.op === "update" && "checksum_sha256" in (op.payload ?? {})
        ? "permission denied for table beat_audio_assets"
        : null;
    const { status, body } = await analyze();
    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("permission denied");
    expect(writes().some((op) => op.table === "beats")).toBe(false);
  });
});

describe("USER finalize — asset state, MASTER swap and idempotency", () => {
  it("full flow: session → upload → analyze → finalize activates the new MASTER, beat stays DRAFT", async () => {
    db.tables.beat_audio_assets = [assetRow(OLD_ASSET, { status: "READY", is_active: true })];
    const session = await json(
      await userSessionRoute.POST(
        post({ beatId: BEAT, contentType: "audio/wav", byteSize: 4096, originalFilename: "a.wav" }),
      ),
    );
    expect(session.status).toBe(200);
    const assetId = session.body.assetId as string;
    db.objects.add(session.body.objectKey as string);

    const analyzed = await json(
      await userAnalyzeRoute.POST(post({ beatId: BEAT, assetId })),
    );
    expect(analyzed.status).toBe(200);

    const result = await finalizeUserBeatWithMasterAction(finalizeParams(assetId));
    expect(result).toEqual({ error: null, success: true, beatId: BEAT });
    expect(asset(assetId)).toMatchObject({ status: "READY", is_active: true });
    expect(asset(OLD_ASSET)).toMatchObject({
      status: "REPLACED",
      is_active: false,
      replaced_by_asset_id: assetId,
    });
    expect(beat()).toMatchObject({ status: "DRAFT", title: "Final title", bpm: 120 });
  });

  it("(16) USER finalize: one RPC call with the session owner and validated metadata; no direct beat or activation write", async () => {
    const result = await finalizeUserBeatWithMasterAction({
      ...finalizeParams(),
      title: "  Final title  ",
      tags: [" boom ", "", "bap"],
      producer: "Prod",
    });
    expect(result).toEqual({ error: null, success: true, beatId: BEAT });
    expect(rpcArgs()).toEqual({
      p_beat_id: BEAT,
      p_asset_id: NEW_ASSET,
      p_ownership_type: "USER",
      p_owner_id: VIEWER,
      p_content_type: "audio/wav",
      p_byte_size: 4096,
      p_checksum_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_duration_seconds: 95,
      p_apply_metadata: true,
      p_title: "Final title",
      p_producer: "Prod",
      p_description: null,
      p_genre: null,
      p_style: null,
      p_bpm: 120,
      p_key: null,
      p_scale: null,
      p_tags: ["boom", "bap"],
      p_cover_ref: null,
    });
    expect(beatWrites()).toEqual([]);
    expect(activationWrites()).toEqual([]);
  });

  it("(7) retry after a committed finalize (lost response) → idempotent success, nothing written", async () => {
    expect((await finalizeUserBeatWithMasterAction(finalizeParams())).success).toBe(true);
    db.ops = [];
    db.rpcCalls = [];
    const stateBefore = JSON.stringify(db.tables);
    const retry = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(retry).toEqual({ error: null, success: true, beatId: BEAT });
    expect(JSON.stringify(db.tables)).toBe(stateBefore);
    expect(writes()).toEqual([]);
    expect(activeMasters().map((row) => row.id)).toEqual([NEW_ASSET]);
  });

  it("(7) retry with different metadata after commit → CONFLICT, nothing written", async () => {
    expect((await finalizeUserBeatWithMasterAction(finalizeParams())).success).toBe(true);
    db.ops = [];
    const retry = await finalizeUserBeatWithMasterAction({
      ...finalizeParams(),
      title: "Changed title",
    });
    expect(retry).toEqual({ error: "Asset is not a pending MASTER upload.", success: false });
    expect(beat().title).toBe("Final title");
    expect(writes()).toEqual([]);
  });

  it.each([
    ["(8) REPLACED", { status: "REPLACED" }, "Asset is not a pending MASTER upload."],
    ["(9) FAILED", { status: "FAILED" }, "Asset is not a pending MASTER upload."],
    ["(10) READY, not active", { status: "READY" }, "Asset is not a pending MASTER upload."],
    ["(11)(13) PLAYBACK purpose", { purpose: "PLAYBACK" }, "Expected MASTER asset."],
    ["(13) DOWNLOAD purpose", { purpose: "DOWNLOAD" }, "Expected MASTER asset."],
  ])("%s asset → refused before download; RPC never called", async (_label, overrides, message) => {
    Object.assign(asset(NEW_ASSET), overrides);
    const result = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: message, success: false });
    expect(writes()).toEqual([]);
    expect(db.storage).toEqual([]);
    expect(db.rpcCalls).toEqual([]);
    expect(activeMasters().map((row) => row.id)).toEqual([OLD_ASSET]);
  });

  it("(12) asset of another beat → FORBIDDEN before download; RPC never called", async () => {
    asset(NEW_ASSET).beat_id = "88888888-8888-4888-8888-888888888888";
    const result = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(result.success).toBe(false);
    expect(db.storage).toEqual([]);
    expect(db.rpcCalls).toEqual([]);
  });

  it("(3) invalid metadata → 400 message before the RPC; nothing written", async () => {
    const result = await finalizeUserBeatWithMasterAction({
      ...finalizeParams(),
      title: "x".repeat(201),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("title must be between");
    expect(db.rpcCalls).toEqual([]);
    expect(writes()).toEqual([]);
    expect(asset(NEW_ASSET).status).toBe("PENDING_UPLOAD");
  });

  it("BPM policy code reaches the client unchanged (UI maps it)", async () => {
    const result = await finalizeUserBeatWithMasterAction(finalizeParams(NEW_ASSET, 0));
    expect(result.error).toBe("BLOCKED_BPM_SELECTION_REQUIRED");
    expect(asset(NEW_ASSET).status).toBe("PENDING_UPLOAD");
  });

  it.each([
    ["BEAT_CHANGED", "Beat changed during the update. Reload and try again."],
    ["NOT_PENDING_MASTER", "Asset is not a pending MASTER upload."],
    ["ALREADY_FINALIZED", "Asset is not a pending MASTER upload."],
    ["ACTIVE_AUDIO_CHANGED", "Active audio changed during the update. Try again."],
    ["ASSET_NOT_FOUND", "Audio asset not found."],
    ["BEAT_NOT_FOUND", "Beat not found."],
    ["ASSET_BEAT_MISMATCH", "Asset does not belong to beat."],
  ])("RPC refusal %s → authored message, not logged", async (token, message) => {
    db.rpcError = { message: token, code: "P0001" };
    const result = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: message, success: false });
    expect(consoleError).not.toHaveBeenCalled();
    expect(beatWrites()).toEqual([]);
  });

  it.each([
    ["(14) connection failure", { message: "connection reset by peer", code: "08006" }],
    ["unknown P0001 token", { message: "SOMETHING_ELSE", code: "P0001" }],
    ["missing EXECUTE grant", { message: "permission denied for function finalize_beat_master_asset", code: "42501" }],
    ["constraint violation", { message: 'new row violates check constraint "beats_duration_range_chk"', code: "23514" }],
  ])("(14) %s → generic message + server log, raw database text hidden", async (_label, rpcError) => {
    db.rpcError = rpcError;
    const result = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: BEAT_ACTION_INTERNAL_ERROR, success: false });
    expect(JSON.stringify(result)).not.toContain(rpcError.message);
    expect(consoleError).toHaveBeenCalledWith(
      "[beats/user-create-with-master] unexpected error",
      expect.any(Error),
    );
  });

  it("(15) beat owned by another user → denied before download; RPC never called", async () => {
    db.tables.beats = [beatRow({ owner_id: OTHER_USER })];
    const result = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(result.success).toBe(false);
    expect(db.storage).toEqual([]);
    expect(db.rpcCalls).toEqual([]);
  });

  it("(15) role without beats.create / staff role → denied; RPC never called", async () => {
    for (const viewer of [
      { role: "USER", permissions: [] },
      { role: "ADMIN", permissions: ADMIN_ALL },
    ]) {
      db.viewer = viewer;
      const result = await finalizeUserBeatWithMasterAction(finalizeParams());
      expect(result.success).toBe(false);
    }
    expect(db.rpcCalls).toEqual([]);
    expect(writes()).toEqual([]);
  });

  describe("no previous active MASTER (model; real locking in the local Postgres suite)", () => {
    beforeEach(() => {
      db.tables.beat_audio_assets = [assetRow(NEW_ASSET), assetRow(SECOND_ASSET)];
      db.objects = new Set(
        db.tables.beat_audio_assets.map((row) => row.object_key as string),
      );
    });

    it("(19) an RPC refusal (lost race) leaves no metadata of the refused upload on the beat", async () => {
      db.rpcError = { message: "ACTIVE_AUDIO_CHANGED", code: "P0001" };
      const result = await finalizeUserBeatWithMasterAction({
        ...finalizeParams(SECOND_ASSET),
        title: "Loser title",
      });
      expect(result).toEqual({
        error: "Active audio changed during the update. Try again.",
        success: false,
      });
      expect(beat().title).toBe("Draft");
      expect(beat().duration_seconds).toBe(1);
      expect(beatWrites()).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("(6)(20) two finalizations of different assets: exactly one active MASTER, beat metadata of that asset", async () => {
      const results = await Promise.all([
        finalizeUserBeatWithMasterAction({ ...finalizeParams(NEW_ASSET), title: "Title A" }),
        finalizeUserBeatWithMasterAction({ ...finalizeParams(SECOND_ASSET), title: "Title B" }),
      ]);
      expect(results.every((r) => r.success)).toBe(true);
      expect(activeMasters()).toHaveLength(1);
      const active = activeMasters()[0].id;
      expect(beat().title).toBe(active === NEW_ASSET ? "Title A" : "Title B");
      const other = active === NEW_ASSET ? SECOND_ASSET : NEW_ASSET;
      expect(asset(other)).toMatchObject({ status: "REPLACED", replaced_by_asset_id: active });
    });

    it("(5) two finalizations of the same asset: one commit, one idempotent replay", async () => {
      const results = await Promise.all([
        finalizeUserBeatWithMasterAction(finalizeParams(NEW_ASSET)),
        finalizeUserBeatWithMasterAction(finalizeParams(NEW_ASSET)),
      ]);
      expect(results).toEqual([
        { error: null, success: true, beatId: BEAT },
        { error: null, success: true, beatId: BEAT },
      ]);
      expect(activeMasters().map((row) => row.id)).toEqual([NEW_ASSET]);
    });
  });

  it("malformed asset id → NOT_FOUND without querying assets", async () => {
    const result = await finalizeUserBeatWithMasterAction({
      ...finalizeParams(),
      assetId: "not-a-uuid",
    });
    expect(result).toEqual({ error: "Audio asset not found.", success: false });
    expect(db.ops.some((op) => op.table === "beat_audio_assets")).toBe(false);
  });

  it("anonymous → message, no data access", async () => {
    db.viewer = null;
    const result = await finalizeUserBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: "Authentication required.", success: false });
    expect(db.ops).toEqual([]);
  });
});

describe("PLATFORM finalize (admin create flow)", () => {
  beforeEach(() => {
    db.viewer = { role: "ADMIN", permissions: ADMIN_ALL };
    db.tables.beats = [beatRow({ ownership_type: "PLATFORM", owner_id: null })];
    db.tables.beat_audio_assets = [
      assetRow(OLD_ASSET, { platform: true, status: "READY", is_active: true }),
      assetRow(NEW_ASSET, { platform: true }),
    ];
    db.objects = new Set(
      db.tables.beat_audio_assets.map((row) => row.object_key as string),
    );
  });

  it("(18) success: metadata and MASTER swap in one PLATFORM RPC call; no direct beat or activation write", async () => {
    const result = await finalizePlatformBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: null, success: true, beatId: BEAT });
    expect(rpcArgs()).toMatchObject({
      p_ownership_type: "PLATFORM",
      p_owner_id: null,
      p_apply_metadata: true,
      p_title: "Final title",
      p_bpm: 120,
      p_duration_seconds: 95,
    });
    expect(beatWrites()).toEqual([]);
    expect(activationWrites()).toEqual([]);
    expect(activeMasters().map((row) => row.id)).toEqual([NEW_ASSET]);
    expect(asset(OLD_ASSET).status).toBe("REPLACED");
    expect(beat()).toMatchObject({ title: "Final title", duration_seconds: 95 });
  });

  it("PLATFORM analyze never writes the beat (title / duration wait for finalize)", async () => {
    const analyzeRoute = await import("@/app/api/admin/beats/audio/analyze/route");
    const response = await analyzeRoute.POST(post({ beatId: BEAT, assetId: NEW_ASSET }));
    expect(response.status).toBe(200);
    expect(beatWrites()).toEqual([]);
    expect(beat().duration_seconds).toBe(1);
    expect(asset(NEW_ASSET).status).toBe("PENDING_UPLOAD");
  });

  it("ADMIN without beats.edit → denied before any read or write (even when analysis would fail)", async () => {
    db.viewer = {
      role: "ADMIN",
      permissions: ADMIN_ALL.filter((key) => key !== "beats.edit"),
    };
    db.analysis = "Plik audio jest pusty.";
    const result = await finalizePlatformBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: "Missing permission.", success: false });
    expect(db.ops).toEqual([]);
    expect(db.storage).toEqual([]);
    expect(asset(NEW_ASSET).status).toBe("PENDING_UPLOAD");
  });

  it.each([{ status: "REPLACED" }, { status: "FAILED" }, { status: "READY" }])(
    "asset %o → CONFLICT, no download, no writes",
    async (overrides) => {
      Object.assign(asset(NEW_ASSET), overrides);
      const result = await finalizePlatformBeatWithMasterAction(finalizeParams());
      expect(result).toEqual({
        error: "Asset is not a pending MASTER upload.",
        success: false,
      });
      expect(writes()).toEqual([]);
      expect(db.storage).toEqual([]);
    },
  );

  it("USER-owned beat → FORBIDDEN, nothing written", async () => {
    db.tables.beats = [beatRow()];
    const result = await finalizePlatformBeatWithMasterAction(finalizeParams());
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("database failure → generic message, logged, raw text hidden", async () => {
    db.failWhen = (op) =>
      op.table === "beat_audio_assets" && op.op === "select"
        ? "relation beat_audio_assets does not exist (SQLSTATE 42P01)"
        : null;
    const result = await finalizePlatformBeatWithMasterAction(finalizeParams());
    expect(result).toEqual({ error: BEAT_ACTION_INTERNAL_ERROR, success: false });
    expect(consoleError).toHaveBeenCalledWith(
      "[beats/create-with-master] unexpected error",
      expect.any(Error),
    );
  });
});

describe("ADMIN MASTER replace (/api/admin/beats/[id]/master complete)", () => {
  const complete = async (assetId = NEW_ASSET) =>
    json(
      await adminMasterRoute.POST(post({ action: "complete", assetId }), {
        params: Promise.resolve({ id: BEAT }),
      }),
    );

  beforeEach(() => {
    db.viewer = { role: "ADMIN", permissions: ADMIN_ALL };
    db.tables.beats = [
      beatRow({ ownership_type: "PLATFORM", owner_id: null, status: "PUBLISHED", duration_seconds: 60, bpm: 90 }),
    ];
    db.tables.beat_audio_assets = [
      assetRow(OLD_ASSET, { platform: true, status: "READY", is_active: true }),
      assetRow(NEW_ASSET, { platform: true }),
    ];
    db.objects = new Set(
      db.tables.beat_audio_assets.map((row) => row.object_key as string),
    );
  });

  it("(17) success: one RPC with the measured duration and no metadata; BPM and title kept", async () => {
    const { status, body } = await complete();
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, assetId: NEW_ASSET, status: "READY" });
    expect(rpcArgs()).toMatchObject({
      p_ownership_type: "PLATFORM",
      p_owner_id: null,
      p_apply_metadata: false,
      p_duration_seconds: 150,
      p_title: null,
      p_bpm: null,
    });
    expect(beatWrites()).toEqual([]);
    expect(activationWrites()).toEqual([]);
    expect(activeMasters().map((row) => row.id)).toEqual([NEW_ASSET]);
    expect(beat()).toMatchObject({ duration_seconds: 150, bpm: 90, title: "Draft", status: "PUBLISHED" });
  });

  it("unreadable duration → 400, asset FAILED, RPC never called, previous MASTER untouched", async () => {
    db.analysis = "Nie udało się odczytać czasu trwania z pliku audio.";
    const { status, body } = await complete();
    expect(status).toBe(400);
    expect(body).toEqual({
      error: "Nie udało się odczytać czasu trwania z pliku audio.",
      code: "INVALID",
    });
    expect(db.rpcCalls).toEqual([]);
    expect(asset(NEW_ASSET).status).toBe("FAILED");
    expect(activeMasters().map((row) => row.id)).toEqual([OLD_ASSET]);
    expect(beat().duration_seconds).toBe(60);
  });

  it("(15) MODERATOR / ADMIN without beats.edit → 403, no data access, RPC never called", async () => {
    for (const viewer of [
      { role: "MODERATOR", permissions: ["beats.approve", "beats.edit"] },
      { role: "ADMIN", permissions: ADMIN_ALL.filter((key) => key !== "beats.edit") },
    ]) {
      db.viewer = viewer;
      const { status } = await complete();
      expect(status).toBe(403);
    }
    expect(db.rpcCalls).toEqual([]);
    expect(db.storage).toEqual([]);
  });

  it("RPC conflict → 409 CONFLICT; infrastructure error → 500 generic + log", async () => {
    db.rpcError = { message: "ACTIVE_AUDIO_CHANGED", code: "P0001" };
    const conflict = await complete();
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("CONFLICT");

    db.rpcError = { message: "canceling statement due to statement timeout", code: "57014" };
    const failure = await complete();
    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ error: BEAT_AUDIO_INTERNAL_ERROR, code: "INTERNAL" });
    expect(consoleError).toHaveBeenCalledWith(
      "[api/admin/beats/[id]/master] unexpected error",
      expect.any(Error),
    );
  });
});
