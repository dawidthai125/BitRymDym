/**
 * Security Audit Wave 2 — a malformed beat id is "not found", never a
 * PostgREST 22P02 surfacing as an internal error. Real service, fake client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ queries: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    db.queries += 1;
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: {
                code: "22P02",
                message: 'invalid input syntax for type uuid: "not-a-uuid"',
              },
            }),
          }),
        }),
      }),
    };
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/session")>(
      "@/lib/auth/session",
    );
  return { ...actual, requireRole: async () => ({}) };
});

const { AuthError } = await import("@/lib/auth/session");
const { getStaffCommunityBeatForModeration } = await import(
  "@/lib/beats/service"
);
const { isUuid } = await import("@/lib/beats/audio-validation");

beforeEach(() => {
  db.queries = 0;
});

describe("loadBeat with a malformed id", () => {
  it.each(["not-a-uuid", "", "1", "33333333-3333-4333-8333-33333333333"])(
    "%j → AuthError NOT_FOUND without querying",
    async (id) => {
      const error = await getStaffCommunityBeatForModeration(id).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(AuthError);
      expect((error as InstanceType<typeof AuthError>).code).toBe("NOT_FOUND");
      expect(db.queries).toBe(0);
    },
  );

  it("a well-formed id still reaches the database", async () => {
    const error = await getStaffCommunityBeatForModeration(
      "33333333-3333-4333-8333-333333333333",
    ).catch((caught: unknown) => caught);
    expect(db.queries).toBe(1);
    expect(error).not.toBeInstanceOf(AuthError);
  });
});

describe("isUuid", () => {
  it("accepts uuids and rejects everything else", () => {
    expect(isUuid("33333333-3333-4333-8333-333333333333")).toBe(true);
    expect(isUuid("33333333-3333-4333-8333-33333333333g")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
