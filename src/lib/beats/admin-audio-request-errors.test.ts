/**
 * Security Audit Wave 2 — PLATFORM audio validation failures are classified as
 * BeatRequestError (→ 400 in the admin API), not as internal errors.
 */

import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ clients: 0 }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    db.clients += 1;
    throw new Error("admin client must not be used");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    db.clients += 1;
    throw new Error("server client must not be used");
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/session")>(
      "@/lib/auth/session",
    );
  return {
    ...actual,
    requirePermission: async () => ({
      userId: "11111111-1111-4111-8111-111111111111",
      profile: { role: "ADMIN" },
    }),
  };
});

const { BeatRequestError } = await import("@/lib/beats/request-error");
const { createPlatformBeatSignedUploadSession } = await import(
  "@/lib/beats/audio-transport"
);

describe("createPlatformBeatSignedUploadSession", () => {
  it.each([
    ["unsupported content type", { contentType: "text/plain", byteSize: 1000 }],
    ["empty file", { contentType: "audio/wav", byteSize: 0 }],
    [
      "oversized file",
      { contentType: "audio/wav", byteSize: Number.MAX_SAFE_INTEGER },
    ],
  ])("%s → BeatRequestError INVALID before any database access", async (_l, params) => {
    const error = await createPlatformBeatSignedUploadSession(params).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BeatRequestError);
    expect((error as InstanceType<typeof BeatRequestError>).code).toBe(
      "INVALID",
    );
    expect(db.clients).toBe(0);
  });
});
