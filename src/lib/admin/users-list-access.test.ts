import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, requireUser } from "@/lib/auth/session";
import {
  adminUsersListAccessDenial,
  requireAdminUsersListAccess,
} from "@/lib/admin/users-list";
import type { AuthContext } from "@/lib/auth/types";
import type { PermissionKey } from "@/types/permissions";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireUser: vi.fn() };
});

const requireUserMock = vi.mocked(requireUser);

function context(
  role: AuthContext["profile"]["role"],
  permissions: PermissionKey[],
): AuthContext {
  return {
    userId: "user-1",
    email: "user@example.com",
    profile: {
      id: "user-1",
      displayName: "User",
      userNumber: 1,
      role,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions,
  };
}

async function denialOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "ALLOWED";
  } catch (error) {
    return adminUsersListAccessDenial(error);
  }
}

describe("admin users list access denial classification", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
  });

  it("anonymous viewer is denied as UNAUTHENTICATED (handled, not rethrown)", async () => {
    requireUserMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "Authentication required."),
    );
    await expect(requireAdminUsersListAccess()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(await denialOf(requireAdminUsersListAccess())).toBe("UNAUTHENTICATED");
  });

  it("authenticated USER / MODERATOR / ADMIN without users.view|edit stay FORBIDDEN", async () => {
    for (const ctx of [
      context("USER", []),
      context("MODERATOR", ["users.view", "users.edit"]),
      context("ADMIN", ["audit_log.view"]),
    ]) {
      requireUserMock.mockResolvedValue(ctx);
      expect(await denialOf(requireAdminUsersListAccess())).toBe("FORBIDDEN");
    }
  });

  it("ADMIN with users.view keeps access", async () => {
    requireUserMock.mockResolvedValue(context("ADMIN", ["users.view"]));
    expect(await denialOf(requireAdminUsersListAccess())).toBe("ALLOWED");
  });

  it("unexpected errors are not classified as expected denials", async () => {
    const failure = new Error("Failed to load profile: connection refused");
    requireUserMock.mockRejectedValue(failure);
    await expect(requireAdminUsersListAccess()).rejects.toBe(failure);
    expect(adminUsersListAccessDenial(failure)).toBeNull();
    expect(adminUsersListAccessDenial(new Error("Authentication required."))).toBeNull();
    expect(adminUsersListAccessDenial({ code: "UNAUTHENTICATED" })).toBeNull();
    expect(adminUsersListAccessDenial("UNAUTHENTICATED")).toBeNull();
    expect(adminUsersListAccessDenial(null)).toBeNull();
  });

  it("other AuthError codes keep their existing (rethrow) handling", () => {
    expect(adminUsersListAccessDenial(new AuthError("NOT_FOUND", "x"))).toBeNull();
    expect(adminUsersListAccessDenial(new AuthError("CONFLICT", "x"))).toBeNull();
  });
});

describe("admin users route contract (no authz weakening)", () => {
  const page = readFileSync(join(process.cwd(), "src/app/admin/users/page.tsx"), "utf8");
  const layout = readFileSync(join(process.cwd(), "src/app/admin/users/layout.tsx"), "utf8");
  const list = readFileSync(join(process.cwd(), "src/lib/admin/users-list.ts"), "utf8");

  it("listAdminUsers enforces access before any data access", () => {
    const body = list.slice(list.indexOf("export async function listAdminUsers"));
    const guard = body.indexOf("await requireAdminUsersListAccess()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf("createSupabaseAdminClient()"));
  });

  it("page handles expected denials and still rethrows other AuthError", () => {
    expect(page).toMatch(/denial = adminUsersListAccessDenial\(error\)/);
    expect(page).toMatch(/if \(error instanceof AuthError\) throw error;/);
    expect(page).toMatch(/if \(denial === "UNAUTHENTICATED"\) redirect\("\/sign-in"\);/);
    expect(page).toMatch(/if \(denial === "FORBIDDEN"\) return null;/);
    const denialReturn = page.indexOf('if (denial === "FORBIDDEN") return null;');
    expect(denialReturn).toBeLessThan(page.indexOf("listAdminUserAuditEvents(auditQuery)"));
  });

  it("layout keeps its guard, redirect and denial UI", () => {
    expect(layout).toMatch("await requireAdminUsersListAccess()");
    expect(layout).toMatch('redirect("/sign-in")');
    expect(layout).toMatch("Brak dostępu");
  });
});
