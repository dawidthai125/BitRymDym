/**
 * "Importuj wokal" without the browser (owner order 2026-11-26): the API itself refuses an import without
 * the rights statement, stores the statement, refuses a taken-down file at finalize (and removes it),
 * checks the content type from the bytes, and lets a good file through to the acoustic screen.
 * The take routes are called directly, like curl would, skipping every UI prompt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UPLOAD_RIGHTS_STATEMENT_VERSION } from "@/config/rights-statement";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BEAT = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const TAKE = "44444444-4444-4444-8444-444444444444";
const ctx = { userId: OWNER, role: "USER", email: null } as never;

// ---------------------------------------------------------------- admin double
type Call = { table: string; op: string; values?: unknown; filters: Record<string, unknown> };
const state = {
  calls: [] as Call[],
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  removed: [] as string[],
  take: null as Record<string, unknown> | null,
  bytes: new Uint8Array(),
  shaMatch: null as null | string,
};

function builder(table: string) {
  const call: Call = { table, op: "select", filters: {} };
  const b = {
    select: () => b,
    insert: (values: unknown) => { call.op = "insert"; call.values = values; state.calls.push(call); return Promise.resolve({ data: null, error: null }); },
    update: (values: unknown) => { call.op = "update"; call.values = values; state.calls.push(call); return b; },
    eq: (k: string, v: unknown) => { call.filters[k] = v; return b; },
    is: () => b,
    limit: () => b,
    in: () => b,
    order: () => b,
    maybeSingle: async () => {
      if (table === "takes") return { data: state.take, error: null };
      if (table === "beats") return { data: { id: BEAT, status: "PUBLISHED", duration_seconds: 120, bpm: 90 }, error: null };
      if (table === "beat_audio_assets") return { data: { id: "asset" }, error: null };
      if (table === "studio_projects") return { data: call.filters.owner_id === OWNER ? { id: PROJECT } : null, error: null };
      return { data: null, error: null };
    },
    then: (res: (v: { data: unknown; error: null }) => unknown) => res({ data: [{ id: "x" }], error: null }),
  };
  return b;
}

const admin = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    state.rpc.push({ fn, args });
    if (fn === "check_upload_sha256") return { data: state.shaMatch ? [{ match_kind: state.shaMatch, blocked_id: "b1", catalog_beat_id: null }] : [], error: null };
    return { data: null, error: null };
  },
  storage: {
    from: () => ({
      createSignedUploadUrl: async (key: string) => ({ data: { path: key, token: "tok", signedUrl: "https://storage.test/upload" }, error: null }),
      download: async () => ({ data: new Blob([state.bytes]), error: null }),
      remove: async (keys: string[]) => { state.removed.push(...keys); return { data: null, error: null }; },
    }),
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => admin }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => ctx }));
vi.mock("@/lib/beats/usage/beat-usage-server", () => ({
  BEAT_RECORD_NOT_ALLOWED: "no", BEAT_USAGE_COLUMNS: "status", beatUsageSubjectFromRow: (r: unknown) => r, viewerPurchasedPaidBeat: async () => false,
}));
vi.mock("@/lib/beats/usage/beat-usage-policy", () => ({ canUseBeatInStudio: () => ({ allowed: true }) }));
vi.mock("@/lib/grants/beat-access-grants", () => ({ hasActiveRecordGrant: async () => false }));
vi.mock("@/lib/audio/load-premium-entitlement", () => ({ resolveProductEntitlementForAuthContext: async () => ({ premiumTier: "GOLD" }) }));
vi.mock("@/lib/takes/sample-policy-settings", () => ({ loadSamplePolicyDurationOverrides: async () => ({}) }));
vi.mock("@/lib/takes/authz", async (orig) => ({
  ...(await orig<typeof import("@/lib/takes/authz")>()),
  assertTakeRecordAccess: () => ({ maxRecordingSeconds: 180, policy: { ttlSeconds: 3600, maxActiveReady: 10, maxSessionsPerUtcDay: 10 } }),
}));
const markPendingTakeFailed = vi.fn(async (p: { removeObject?: boolean; objectKey?: string | null }) => {
  if (p.removeObject && p.objectKey) state.removed.push(p.objectKey);
  return true;
});
const swap = vi.fn(async () => ({ takeId: TAKE, beatId: BEAT, durationSeconds: 30, byteSize: 100, contentType: "audio/wav" }));
vi.mock("@/lib/takes/finalize-swap", () => ({ invokeFinalizeTakeReadySwap: (...a: unknown[]) => swap(...(a as [])), markPendingTakeFailed: (p: never) => markPendingTakeFailed(p) }));
vi.mock("@/lib/beats/audio-duration", () => ({ probeAudioDurationFromBytes: async () => ({ ok: true, durationSeconds: 30 }) }));
vi.mock("@/lib/creator-progress/award-hooks", () => ({ hookTakeReadyAuth: async () => undefined }));

const wav = () => {
  const b = new Uint8Array(64);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WAVE"].map((c) => c.charCodeAt(0)), 8);
  return b;
};

async function postSession(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/takes/session/route");
  return POST(new Request("http://localhost/api/takes/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ beatId: BEAT, contentType: "audio/wav", byteSize: 64, ...body }) }));
}
async function postFinalize() {
  const { POST } = await import("@/app/api/takes/finalize/route");
  return POST(new Request("http://localhost/api/takes/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ takeId: TAKE }) }));
}

beforeEach(async () => {
  state.calls = []; state.rpc = []; state.removed = []; state.shaMatch = null; state.bytes = wav();
  const { buildUserTakeObjectKey } = await import("@/lib/takes/object-key");
  state.take = {
    id: TAKE, owner_id: OWNER, beat_id: BEAT, status: "PENDING_UPLOAD", object_key: buildUserTakeObjectKey({ ownerId: OWNER, takeId: TAKE }),
    storage_bucket: "take-audio", content_type: "audio/wav", recording_max_seconds_snapshot: 180,
    expires_at: new Date(Date.now() + 3600_000).toISOString(), deleted_at: null, is_stem: false,
  };
  markPendingTakeFailed.mockClear();
  swap.mockClear();
});

describe("POST /api/takes/session — import needs the statement on the server", () => {
  it("refuses an import without the statement (also the legacy flag alone) and opens no session", async () => {
    for (const body of [{ source: "import" }, { rightsConfirmed: true }, { source: "import", rightsStatementVersion: "2025-01-01" }]) {
      const res = await postSession(body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code?: string }).code).toBe("RIGHTS_REQUIRED");
    }
    expect(state.rpc.map((r) => r.fn)).not.toContain("claim_take_recording_session");
  });

  it("with the statement: session opens and the statement is stored (user, own project, version)", async () => {
    const res = await postSession({ source: "import", rightsStatementVersion: UPLOAD_RIGHTS_STATEMENT_VERSION, projectId: PROJECT });
    expect(res.status).toBe(200);
    const stmt = state.calls.find((c) => c.table === "upload_rights_statements" && c.op === "insert");
    expect(stmt?.values).toMatchObject({ user_id: OWNER, project_id: PROJECT, upload_kind: "vocal_import", statement_version: UPLOAD_RIGHTS_STATEMENT_VERSION });
  });

  it("a live mic / PC recorder take needs no statement", async () => {
    expect((await postSession({ source: "recorder" })).status).toBe(200);
    expect(state.calls.some((c) => c.table === "upload_rights_statements")).toBe(false);
  });
});

describe("POST /api/takes/finalize — upload screen before READY", () => {
  it("refuses a taken-down file, removes it and never makes it READY", async () => {
    state.shaMatch = "blocked_sha256";
    const res = await postFinalize();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("BLOCKED_AUDIO");
    expect(markPendingTakeFailed).toHaveBeenCalledWith(expect.objectContaining({ failureReason: "BLOCKED_AUDIO", removeObject: true }));
    expect(state.removed).toContain(state.take!.object_key);
    expect(swap).not.toHaveBeenCalled();
  });

  it("refuses someone else's catalogue beat uploaded as a vocal", async () => {
    state.shaMatch = "catalog_sha256";
    const res = await postFinalize();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("CATALOG_BEAT");
    expect(swap).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not the declared audio type (renamed file)", async () => {
    state.bytes = new TextEncoder().encode("%PDF-1.7 not audio at all, just a renamed document....");
    const res = await postFinalize();
    expect(res.status).toBe(403);
    expect(markPendingTakeFailed).toHaveBeenCalledWith(expect.objectContaining({ failureReason: "CONTENT_TYPE_MISMATCH" }));
    expect(state.rpc.map((r) => r.fn)).not.toContain("check_upload_sha256");
    expect(swap).not.toHaveBeenCalled();
  });

  it("a good file goes through: hash checked, acoustic screen queued, statement gets the hash", async () => {
    const res = await postFinalize();
    expect(res.status).toBe(200);
    const check = state.rpc.find((r) => r.fn === "check_upload_sha256");
    expect(check?.args).toMatchObject({ p_upload_kind: "take", p_owner_id: OWNER, p_take_id: TAKE, p_allowed_beat_id: null });
    expect(state.calls.find((c) => c.table === "takes" && c.op === "update")?.values).toMatchObject({ screen_status: "pending", sha256: check?.args.p_sha256 });
    expect(state.calls.find((c) => c.table === "upload_rights_statements" && c.op === "update")?.values).toMatchObject({ file_sha256: check?.args.p_sha256 });
    expect(swap).toHaveBeenCalledTimes(1);
  });
});
