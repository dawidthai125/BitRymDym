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
      maybeSingle: async () => ({ data: state.ownsProject ? { id: "p" } : null, error: null }),
      rpc: async (name: string, args: unknown) => {
        state.rpcCalls.push({ name, args });
        return { data: state.sendOk, error: null };
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

function call() {
  return POST(
    new Request("http://x/api", {
      method: "POST",
      body: JSON.stringify({ trackId: "tr", takeId: "tk", timelineStartMs: 0, expectedDocumentVersion: 1 }),
    }),
    { params: Promise.resolve({ projectId: PROJECT }) },
  );
}

beforeEach(() => {
  state.bearer = null;
  state.ownsProject = true;
  state.sendOk = true;
  state.rpcCalls = [];
  state.placed = 0;
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
});
