import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, requireUser } from "@/lib/auth/session";
import { executeCatalogAssetCopyFor } from "@/lib/catalog/catalog-copy-service";
import type { AuthContext } from "@/lib/auth/types";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireUser: vi.fn() };
});

vi.mock("@/lib/catalog/catalog-copy-service", () => ({
  executeCatalogAssetCopyFor: vi.fn(),
}));

const requireUserMock = vi.mocked(requireUser);
const executeMock = vi.mocked(executeCatalogAssetCopyFor);

function auth(): AuthContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    email: "user@example.com",
    profile: {
      id: "33333333-3333-4333-8333-333333333333",
      displayName: "User",
      userNumber: 1,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: [],
  };
}

describe("POST /api/catalog/copy", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    executeMock.mockReset();
  });

  it("requires auth before any copy work", async () => {
    requireUserMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "Authentication required."),
    );
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/catalog/copy", {
        method: "POST",
        body: JSON.stringify({
          catalogAssetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          projectId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("ignores client beatId and declared MIME", async () => {
    requireUserMock.mockResolvedValue(auth());
    executeMock.mockResolvedValue({
      ok: true,
      takeId: "22222222-2222-4222-8222-222222222222",
      beatId: "44444444-4444-4444-8444-444444444444",
      objectKey:
        "user/33333333-3333-4333-8333-333333333333/takes/22222222-2222-4222-8222-222222222222/mic.bin",
      catalogAssetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      status: "READY",
      reusedExisting: false,
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/catalog/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogAssetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          projectId: "11111111-1111-4111-8111-111111111111",
          beatId: "99999999-9999-4999-8999-999999999999",
          contentType: "audio/flac",
          byteSize: 99,
          durationSeconds: 9,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(executeMock).toHaveBeenCalledWith(auth(), {
      catalogAssetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      projectId: "11111111-1111-4111-8111-111111111111",
    });
    await expect(response.json()).resolves.toMatchObject({
      status: "READY",
      reusedExisting: false,
    });
  });

  it("maps fail-closed planner errors to HTTP", async () => {
    requireUserMock.mockResolvedValue(auth());
    executeMock.mockResolvedValue({
      ok: false,
      error: "CATALOG_STORAGE_POLICIES_UNAVAILABLE",
      details: ["catalog_assets table is missing or unknown"],
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/catalog/copy", {
        method: "POST",
        body: JSON.stringify({
          catalogAssetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          projectId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );
    expect(response.status).toBe(503);
  });
});
