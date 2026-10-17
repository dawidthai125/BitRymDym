/**
 * Security Audit Wave 2 — `patchUserDraftMetadataAfterAuthz` boundary.
 * The function uses the service-role client (RLS bypassed), so ownership,
 * ownership type and status must be enforced by the function itself, before
 * any write. Fake Supabase clients only; no database.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContext } from "@/lib/auth/types";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const BEAT_ID = "33333333-3333-4333-8333-333333333333";

type Filter = [op: "eq" | "in", column: string, value: unknown];

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  loads: 0,
  loadError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  /** Rows matched by the UPDATE filters; 0 simulates a concurrent change. */
  updatedRows: 1,
  updates: [] as { payload: Record<string, unknown>; filters: Filter[] }[],
}));

const METADATA_COLUMNS = [
  "title",
  "producer",
  "description",
  "genre",
  "style",
  "bpm",
  "key",
  "scale",
  "duration_seconds",
  "tags",
  "cover_ref",
].sort();

const viewer = vi.hoisted(() => ({
  resolve: async (): Promise<AuthContext> => {
    throw new Error("viewer not set");
  },
}));

function fakeClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            db.loads += 1;
            return { data: db.row, error: db.loadError };
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        const entry = { payload, filters: [] as Filter[] };
        db.updates.push(entry);
        const result = () =>
          db.updateError
            ? { data: null, error: db.updateError }
            : {
                data: Array.from({ length: db.updatedRows }, () => ({
                  id: BEAT_ID,
                })),
                error: null,
              };
        const chain = {
          eq: (column: string, value: unknown) => {
            entry.filters.push(["eq", column, value]);
            return chain;
          },
          in: (column: string, value: unknown) => {
            entry.filters.push(["in", column, value]);
            return chain;
          },
          select: async () => result(),
          then: (resolve: (value: unknown) => unknown) => resolve(result()),
        };
        return chain;
      },
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => fakeClient(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeClient(),
}));

vi.mock("@/lib/auth/session", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/session")>(
      "@/lib/auth/session",
    );
  return { ...actual, requireUser: () => viewer.resolve() };
});

const { AuthError } = await import("@/lib/auth/session");
const { BeatRequestError } = await import("@/lib/beats/request-error");
const { patchUserDraftMetadataAfterAuthz, updateOwnUserDraftMetadata } =
  await import("@/lib/beats/service");

function beatRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BEAT_ID,
    owner_id: OWNER_ID,
    ownership_type: "USER",
    title: "Original",
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
    status: "DRAFT",
    rejection_reason: null,
    last_submitted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function signedInAs(
  userId: string,
  role: "USER" | "MODERATOR" | "ADMIN" = "USER",
) {
  viewer.resolve = async () => ({
    userId,
    email: `${userId}@example.test`,
    permissions: [],
    profile: {
      id: userId,
      displayName: "Owner",
      userNumber: 1,
      role,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
}

async function expectAuthError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AuthError);
  expect((error as InstanceType<typeof AuthError>).code).toBe(code);
}

beforeEach(() => {
  db.row = beatRow();
  db.loads = 0;
  db.loadError = null;
  db.updateError = null;
  db.updatedRows = 1;
  db.updates = [];
  viewer.resolve = async () => {
    throw new AuthError("UNAUTHENTICATED", "Authentication required.");
  };
});

describe("patchUserDraftMetadataAfterAuthz (direct call)", () => {
  it("updates the owner's own DRAFT, scoped by owner, type and status", async () => {
    await patchUserDraftMetadataAfterAuthz({
      beatId: BEAT_ID,
      ownerId: OWNER_ID,
      patch: { title: "New title" },
    });

    expect(db.updates).toHaveLength(1);
    const [update] = db.updates;
    expect(update!.payload).toMatchObject({ title: "New title" });
    expect(Object.keys(update!.payload).sort()).toEqual(METADATA_COLUMNS);
    expect(update!.filters).toEqual([
      ["eq", "id", BEAT_ID],
      ["eq", "owner_id", OWNER_ID],
      ["eq", "ownership_type", "USER"],
      ["eq", "status", "DRAFT"],
    ]);
  });

  it("updates the owner's REJECTED beat (Wave 3 rework contract) without touching status or reason", async () => {
    db.row = beatRow({ status: "REJECTED", rejection_reason: "Mix too loud" });
    await patchUserDraftMetadataAfterAuthz({
      beatId: BEAT_ID,
      ownerId: OWNER_ID,
      patch: { title: "Reworked" },
    });
    expect(db.updates).toHaveLength(1);
    const [update] = db.updates;
    expect(update!.payload).toMatchObject({ title: "Reworked" });
    expect(update!.payload).not.toHaveProperty("status");
    expect(update!.payload).not.toHaveProperty("rejection_reason");
    expect(update!.filters).toContainEqual(["eq", "status", "REJECTED"]);
  });

  it("reports CONFLICT when status or owner changed between read and write", async () => {
    db.row = beatRow({ status: "REJECTED", rejection_reason: "Mix too loud" });
    db.updatedRows = 0;
    await expectAuthError(
      patchUserDraftMetadataAfterAuthz({
        beatId: BEAT_ID,
        ownerId: OWNER_ID,
        patch: { title: "Reworked" },
      }),
      "CONFLICT",
    );
  });

  it("treats a malformed beat id as NOT_FOUND without querying", async () => {
    await expectAuthError(
      patchUserDraftMetadataAfterAuthz({
        beatId: "not-a-uuid",
        ownerId: OWNER_ID,
        patch: { title: "x" },
      }),
      "NOT_FOUND",
    );
    expect(db.loads).toBe(0);
    expect(db.updates).toHaveLength(0);
  });

  it("denies another user's beat before any write", async () => {
    await expectAuthError(
      patchUserDraftMetadataAfterAuthz({
        beatId: BEAT_ID,
        ownerId: OTHER_USER_ID,
        patch: { title: "Hijack" },
      }),
      "FORBIDDEN",
    );
    expect(db.updates).toHaveLength(0);
  });

  it("denies PLATFORM beats before any write", async () => {
    db.row = beatRow({ ownership_type: "PLATFORM", owner_id: null });
    await expectAuthError(
      patchUserDraftMetadataAfterAuthz({
        beatId: BEAT_ID,
        ownerId: OWNER_ID,
        patch: { title: "x" },
      }),
      "FORBIDDEN",
    );
    expect(db.updates).toHaveLength(0);
  });

  it.each(["PENDING_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"])(
    "denies the owner's %s beat before any write",
    async (status) => {
      db.row = beatRow({ status });
      await expectAuthError(
        patchUserDraftMetadataAfterAuthz({
          beatId: BEAT_ID,
          ownerId: OWNER_ID,
          patch: { title: "x" },
        }),
        "FORBIDDEN",
      );
      expect(db.updates).toHaveLength(0);
    },
  );

  it("reports a missing beat as NOT_FOUND without writing", async () => {
    db.row = null;
    await expectAuthError(
      patchUserDraftMetadataAfterAuthz({
        beatId: BEAT_ID,
        ownerId: OWNER_ID,
        patch: { title: "x" },
      }),
      "NOT_FOUND",
    );
    expect(db.updates).toHaveLength(0);
  });

  it("propagates a database read failure as a non-auth error without writing", async () => {
    db.loadError = { message: "connection reset" };
    const error = await patchUserDraftMetadataAfterAuthz({
      beatId: BEAT_ID,
      ownerId: OWNER_ID,
      patch: { title: "x" },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AuthError);
    expect(db.updates).toHaveLength(0);
  });

  it("propagates a database write failure as a non-auth error", async () => {
    db.updateError = { message: "write failed" };
    const error = await patchUserDraftMetadataAfterAuthz({
      beatId: BEAT_ID,
      ownerId: OWNER_ID,
      patch: { title: "x" },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AuthError);
  });

  it("ignores protected fields smuggled into the patch", async () => {
    await patchUserDraftMetadataAfterAuthz({
      beatId: BEAT_ID,
      ownerId: OWNER_ID,
      patch: {
        title: "Ok",
        ownerId: OTHER_USER_ID,
        ownershipType: "PLATFORM",
        status: "PUBLISHED",
        rejectionReason: "x",
        role: "ADMIN",
      } as unknown as { title: string },
    });
    const update = db.updates[0]!;
    expect(Object.keys(update.payload).sort()).toEqual(METADATA_COLUMNS);
    expect(update.filters).toContainEqual(["eq", "owner_id", OWNER_ID]);
  });

  it("rejects invalid metadata as a request error before any write", async () => {
    const error = await patchUserDraftMetadataAfterAuthz({
      beatId: BEAT_ID,
      ownerId: OWNER_ID,
      patch: { bpm: 0 },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BeatRequestError);
    expect((error as Error).message).toMatch(/bpm/);
    expect(db.updates).toHaveLength(0);
  });
});

describe("updateOwnUserDraftMetadata (server action entry point)", () => {
  it("denies an anonymous caller before touching the database", async () => {
    await expectAuthError(
      updateOwnUserDraftMetadata(BEAT_ID, { title: "x" }),
      "UNAUTHENTICATED",
    );
    expect(db.updates).toHaveLength(0);
  });

  it("derives the owner from the session, not from the patch", async () => {
    signedInAs(OTHER_USER_ID);
    await expectAuthError(
      updateOwnUserDraftMetadata(BEAT_ID, {
        title: "x",
        ownerId: OWNER_ID,
      } as unknown as { title: string }),
      "FORBIDDEN",
    );
    expect(db.updates).toHaveLength(0);
  });

  it.each(["MODERATOR", "ADMIN"] as const)(
    "gives a %s no access to another user's draft",
    async (role) => {
      signedInAs(OTHER_USER_ID, role);
      await expectAuthError(
        updateOwnUserDraftMetadata(BEAT_ID, { title: "x" }),
        "FORBIDDEN",
      );
      expect(db.updates).toHaveLength(0);
    },
  );

  it("lets the signed-in owner update their own draft", async () => {
    signedInAs(OWNER_ID);
    const beat = await updateOwnUserDraftMetadata(BEAT_ID, { title: "Mine" });
    expect(beat.id).toBe(BEAT_ID);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.filters).toContainEqual(["eq", "owner_id", OWNER_ID]);
  });
});

describe("call-site contract", () => {
  const read = (file: string) =>
    readFileSync(path.join(process.cwd(), file), "utf8");

  it("is not reachable as a server action", () => {
    const service = read("src/lib/beats/service.ts");
    expect(service.startsWith('import "server-only";')).toBe(true);
    expect(service).not.toMatch(/^["']use server["']/m);
  });

  it("every production caller passes the session user as ownerId", () => {
    const service = read("src/lib/beats/service.ts");
    const pattern =
      /await patchUserDraftMetadataAfterAuthz\(\{\s*beatId(?::[^,]+)?,\s*ownerId:\s*([\w.]+),/g;
    const calls = [...service.matchAll(pattern)];
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("context.userId");

    // Security Wave 5: USER finalize writes metadata through
    // finalize_beat_master_asset (service role) instead; analyze writes none.
    const transport = read("src/lib/beats/audio-transport.ts");
    expect(transport).not.toMatch(/patchUserDraftMetadataAfterAuthz/);
    const userOwnerArgs = [
      ...transport.matchAll(/ownershipType: "USER",\s*ownerId:\s*([\w.]+),/g),
    ];
    expect(userOwnerArgs).toHaveLength(2);
    for (const match of userOwnerArgs) expect(match[1]).toBe("context.userId");
  });
});
