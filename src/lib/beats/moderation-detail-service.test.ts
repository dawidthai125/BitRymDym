/**
 * Security Audit Wave 2 — `getStaffCommunityBeatForModeration` /
 * `getPendingReviewBeatForModeration` with the real guard and loader.
 * The fake server client serves the session profile + role permissions and
 * records every beat / asset query.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const BEAT_ID = "33333333-3333-4333-8333-333333333333";
const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  viewerRole: null as string | null,
  beat: null as Record<string, unknown> | null,
  readyMaster: true,
  beatError: null as { message: string } | null,
  queries: [] as string[],
}));

function builder(table: string) {
  if (table !== "profiles" && table !== "role_permissions") {
    state.queries.push(table);
  }
  const resolve = () => {
    if (table === "profiles") {
      return {
        data: state.viewerRole
          ? {
              id: VIEWER_ID,
              display_name: "Staff",
              user_number: 1,
              role: state.viewerRole,
              account_level: "BEGINNER_RAPPER",
              experience_total: 0,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }
          : null,
        error: null,
      };
    }
    if (table === "role_permissions") return { data: [], error: null };
    if (table === "beats") {
      return state.beatError
        ? { data: null, error: state.beatError }
        : { data: state.beat, error: null };
    }
    if (table === "beat_audio_assets") {
      return {
        data: state.readyMaster ? [{ beat_id: BEAT_ID }] : [],
        error: null,
      };
    }
    return { data: null, error: null };
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    maybeSingle: async () => resolve(),
    then: (done: (value: unknown) => unknown) => done(resolve()),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.viewerRole ? { id: VIEWER_ID, email: null } : null },
        error: null,
      }),
    },
    from: (table: string) => builder(table),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("admin client must not be used for moderation detail");
  },
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

const { AuthError } = await import("@/lib/auth/session");
const {
  getPendingReviewBeatForModeration,
  getStaffCommunityBeatForModeration,
} = await import("@/lib/beats/service");

function beatRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BEAT_ID,
    owner_id: OWNER_ID,
    ownership_type: "USER",
    title: "Queued",
    producer: null,
    description: null,
    genre: null,
    style: null,
    bpm: 120,
    key: null,
    scale: null,
    duration_seconds: 120,
    tags: [],
    cover_ref: null,
    status: "PENDING_REVIEW",
    rejection_reason: null,
    last_submitted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AuthError);
  return (error as InstanceType<typeof AuthError>).code;
}

beforeEach(() => {
  state.viewerRole = "MODERATOR";
  state.beat = beatRow();
  state.readyMaster = true;
  state.beatError = null;
  state.queries = [];
});

describe("viewer guard runs before any beat query", () => {
  it("anonymous → UNAUTHENTICATED", async () => {
    state.viewerRole = null;
    expect(await codeOf(getStaffCommunityBeatForModeration(BEAT_ID))).toBe(
      "UNAUTHENTICATED",
    );
    expect(state.queries).toEqual([]);
  });

  it("USER → FORBIDDEN", async () => {
    state.viewerRole = "USER";
    expect(await codeOf(getStaffCommunityBeatForModeration(BEAT_ID))).toBe(
      "FORBIDDEN",
    );
    expect(state.queries).toEqual([]);
  });

  it.each(["MODERATOR", "ADMIN"])("%s may load a queued USER beat", async (role) => {
    state.viewerRole = role;
    const beat = await getStaffCommunityBeatForModeration(BEAT_ID);
    expect(beat).toMatchObject({ id: BEAT_ID, activeMasterReady: true });
  });
});

describe("content checks", () => {
  it("malformed id → NOT_FOUND without querying beats", async () => {
    expect(await codeOf(getStaffCommunityBeatForModeration("abc"))).toBe(
      "NOT_FOUND",
    );
    expect(state.queries).toEqual([]);
  });

  it("missing beat → NOT_FOUND", async () => {
    state.beat = null;
    expect(await codeOf(getStaffCommunityBeatForModeration(BEAT_ID))).toBe(
      "NOT_FOUND",
    );
  });

  it("PLATFORM beat → FORBIDDEN (page maps to 404)", async () => {
    state.beat = beatRow({ ownership_type: "PLATFORM", owner_id: null });
    expect(await codeOf(getStaffCommunityBeatForModeration(BEAT_ID))).toBe(
      "FORBIDDEN",
    );
  });

  it.each(["DRAFT", "REJECTED", "PUBLISHED", "ARCHIVED"])(
    "USER beat in %s → FORBIDDEN",
    async (status) => {
      state.beat = beatRow({ status });
      expect(await codeOf(getStaffCommunityBeatForModeration(BEAT_ID))).toBe(
        "FORBIDDEN",
      );
    },
  );

  it("APPROVED is allowed by the staff detail but not by the pending-review variant", async () => {
    state.beat = beatRow({ status: "APPROVED" });
    await expect(
      getStaffCommunityBeatForModeration(BEAT_ID),
    ).resolves.toMatchObject({ status: "APPROVED" });
    expect(await codeOf(getPendingReviewBeatForModeration(BEAT_ID))).toBe(
      "FORBIDDEN",
    );
  });

  it("no READY active MASTER is reported, not hidden", async () => {
    state.readyMaster = false;
    await expect(
      getStaffCommunityBeatForModeration(BEAT_ID),
    ).resolves.toMatchObject({ activeMasterReady: false });
  });

  it("database failure is a plain Error, never an AuthError", async () => {
    state.beatError = { message: "connection reset" };
    const error = await getStaffCommunityBeatForModeration(BEAT_ID).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AuthError);
  });
});
