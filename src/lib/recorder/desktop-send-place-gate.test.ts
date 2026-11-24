/**
 * 2026-11-22: the Windows recorder (bearer auth) needs a daily send before it can place
 * a take into a project; the site (cookies, no bearer) is unaffected.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  bearer: null as string | null,
  ownsProject: true,
  sendOk: true,
  rpcCalls: [] as unknown[],
  placed: 0,
  projectError: false,
  // Model of use_desktop_studio_send: null = return sendOk; else unbound sends + bindings.
  model: null as null | { unbound: number; bound: string[] },
  lock: Promise.resolve() as Promise<void>,
}));

vi.mock("@/lib/supabase/server", () => ({
  requestUserAccessBearer: vi.fn(async () => state.bearer),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(async () => ({ userId: "11111111-1111-4111-8111-111111111111", profile: { role: "USER" } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const chain = {
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () =>
        state.projectError
          ? { data: null, error: { message: "timeout" } }
          : { data: state.ownsProject ? { id: "p" } : null, error: null },
      rpc: async (name: string, args: { p_project_id: string }) => {
        state.rpcCalls.push({ name, args });
        const m = state.model;
        if (!m) return { data: state.sendOk, error: null };
        // pg_advisory_xact_lock per owner: serialize the check-and-bind.
        const prev = state.lock;
        let release!: () => void;
        state.lock = new Promise((r) => (release = r));
        await prev;
        try {
          if (m.bound.includes(args.p_project_id)) return { data: true, error: null };
          await new Promise((r) => setTimeout(r, 5));
          if (m.unbound < 1) return { data: false, error: null };
          m.unbound -= 1;
          m.bound.push(args.p_project_id);
          return { data: true, error: null };
        } finally {
          release();
        }
      },
    };
    return chain;
  },
}));

vi.mock("@/lib/studio/studio-record-service", () => ({
  placeReadyTakeAsStudioClip: vi.fn(async () => {
    state.placed += 1;
    return { clip: {}, takeId: "t", durationMs: 1000, reusedExisting: false, documentVersion: 2 };
  }),
}));

import { POST } from "@/app/api/studio/projects/[projectId]/record/place/route";

const PROJECT = "22222222-2222-4222-8222-222222222222";

function call(projectId = PROJECT, extra: Record<string, unknown> = {}) {
  return POST(
    new Request("http://x/api", {
      method: "POST",
      body: JSON.stringify({ trackId: "tr", takeId: "tk", timelineStartMs: 0, expectedDocumentVersion: 1, ...extra }),
    }),
    { params: Promise.resolve({ projectId }) },
  );
}

beforeEach(() => {
  state.bearer = null;
  state.ownsProject = true;
  state.sendOk = true;
  state.rpcCalls = [];
  state.placed = 0;
  state.projectError = false;
  state.model = null;
});

describe("record/place desktop send gate", () => {
  it("site (cookie, no bearer) places without a send", async () => {
    const res = await call();
    expect(res.status).toBe(201);
    expect(state.rpcCalls).toEqual([]);
    expect(state.placed).toBe(1);
  });

  it("recorder with a send places and binds the send to the project", async () => {
    state.bearer = "jwt";
    const res = await call();
    expect(res.status).toBe(201);
    expect(state.rpcCalls).toEqual([{ name: "use_desktop_studio_send", args: { p_owner_id: "11111111-1111-4111-8111-111111111111", p_project_id: PROJECT } }]);
    expect(state.placed).toBe(1);
  });

  it("recorder without a send gets 429 desktop_send_limit and nothing is placed", async () => {
    state.bearer = "jwt";
    state.sendOk = false;
    const res = await call();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "desktop_send_limit" });
    expect(state.placed).toBe(0);
  });

  it("recorder on a project it does not own never spends a send", async () => {
    state.bearer = "jwt";
    state.ownsProject = false;
    await call();
    expect(state.rpcCalls).toEqual([]);
  });

  it("project lookup error fails closed: 500, no place, no send spent", async () => {
    state.bearer = "jwt";
    state.projectError = true;
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Nie udało się sprawdzić limitu wysyłek." });
    expect(state.rpcCalls).toEqual([]);
    expect(state.placed).toBe(0);
  });

  it("one send, many clips into the same project: every place passes, one send bound", async () => {
    state.bearer = "jwt";
    state.model = { unbound: 1, bound: [] };
    const res = await Promise.all([call(), call(), call()]);
    expect(res.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(state.model.bound).toEqual([PROJECT]);
    expect(state.placed).toBe(3);
  });

  it("one send, two parallel places into two different projects: exactly one passes", async () => {
    state.bearer = "jwt";
    state.model = { unbound: 1, bound: [] };
    const other = "33333333-3333-4333-8333-333333333333";
    const [a, b] = await Promise.all([call(), call(other)]);
    expect([a.status, b.status].sort()).toEqual([201, 429]);
    const denied = a.status === 429 ? a : b;
    expect(await denied.json()).toEqual({ error: "desktop_send_limit", code: "DESKTOP_SEND_REQUIRED" });
    expect(state.placed).toBe(1);
  });

  it("recorder sendId is passed to the RPC as p_send_id (exact send)", async () => {
    state.bearer = "jwt";
    const sendId = "44444444-4444-4444-8444-444444444444";
    const res = await call(PROJECT, { sendId });
    expect(res.status).toBe(201);
    expect(state.rpcCalls).toEqual([
      {
        name: "use_desktop_studio_send",
        args: { p_owner_id: "11111111-1111-4111-8111-111111111111", p_project_id: PROJECT, p_send_id: sendId },
      },
    ]);
  });

  it("without sendId (older recorder) the RPC keeps the 2-arg shape", async () => {
    state.bearer = "jwt";
    await call();
    expect(Object.keys((state.rpcCalls[0] as { args: object }).args).sort()).toEqual(["p_owner_id", "p_project_id"]);
  });

  it.each([["nie-uuid"], [123], [""]])("malformed sendId %j is 400, nothing spent or placed", async (sendId) => {
    state.bearer = "jwt";
    const res = await call(PROJECT, { sendId });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nieprawidłowy identyfikator wysyłki." });
    expect(state.rpcCalls).toEqual([]);
    expect(state.placed).toBe(0);
  });

  it("sendId: null is treated like no sendId", async () => {
    state.bearer = "jwt";
    const res = await call(PROJECT, { sendId: null });
    expect(res.status).toBe(201);
    expect(Object.keys((state.rpcCalls[0] as { args: object }).args)).not.toContain("p_send_id");
  });
});
