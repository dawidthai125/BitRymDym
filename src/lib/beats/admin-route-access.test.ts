import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkAccess } from "@/lib/auth/access-denial";
import { hasPermission, hasRole } from "@/lib/auth/permissions";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  requireAdminPlatformBeatsAccess,
  requireModerationAccess,
} from "@/lib/beats/service";
import type { SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";

// A plain function, not vi.fn(): Vitest reports a spy's rejected return value
// as an unhandled rejection even when the caller handles it.
const viewer = vi.hoisted(() => ({
  resolve: async (): Promise<AuthContext> => {
    throw new Error("viewer not set");
  },
}));

// requireRole / requirePermission call requireUser through a module-internal
// binding, so they are re-expressed here on top of the mocked requireUser with
// the same predicates as src/lib/auth/session.ts.
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  const requireUser = () => viewer.resolve();
  return {
    ...actual,
    requireUser,
    requireRole: async (allowed: readonly SystemRole[]) => {
      const context = await requireUser();
      if (!hasRole(context.profile.role, allowed)) {
        throw new actual.AuthError("FORBIDDEN", "Insufficient role.");
      }
      return context;
    },
    requirePermission: async (permission: PermissionKey) => {
      const context = await requireUser();
      if (!hasPermission(context.permissions, permission)) {
        throw new actual.AuthError("FORBIDDEN", "Missing permission.");
      }
      return context;
    },
  };
});

function context(role: SystemRole, permissions: PermissionKey[]): AuthContext {
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

function signedIn(ctx: AuthContext) {
  viewer.resolve = async () => ctx;
}

function rejectWith(error: unknown) {
  viewer.resolve = async () => {
    throw error;
  };
}

function signedOut() {
  rejectWith(new AuthError("UNAUTHENTICATED", "Authentication required."));
}

beforeEach(() => rejectWith(new Error("viewer not set")));

describe("admin PLATFORM beats viewer guard", () => {

  it("anonymous viewer â†’ UNAUTHENTICATED (handled, not thrown)", async () => {
    signedOut();
    await expect(checkAccess(requireAdminPlatformBeatsAccess)).resolves.toBe(
      "UNAUTHENTICATED",
    );
  });

  it("USER and MODERATOR stay FORBIDDEN, even with beats.edit", async () => {
    for (const ctx of [
      context("USER", ["beats.edit"]),
      context("MODERATOR", ["beats.edit", "beats.approve"]),
    ]) {
      signedIn(ctx);
      await expect(checkAccess(requireAdminPlatformBeatsAccess)).resolves.toBe(
        "FORBIDDEN",
      );
    }
  });

  it("ADMIN without beats.edit is FORBIDDEN", async () => {
    signedIn(context("ADMIN", ["beats.create"]));
    await expect(checkAccess(requireAdminPlatformBeatsAccess)).resolves.toBe(
      "FORBIDDEN",
    );
  });

  it("ADMIN with beats.edit keeps access", async () => {
    signedIn(context("ADMIN", ["beats.edit"]));
    await expect(checkAccess(requireAdminPlatformBeatsAccess)).resolves.toBeNull();
  });

  it("unexpected profile load failure still propagates", async () => {
    const failure = new Error("Failed to load profile: timeout");
    rejectWith(failure);
    await expect(checkAccess(requireAdminPlatformBeatsAccess)).rejects.toBe(failure);
  });
});

describe("moderation viewer guard", () => {
  it("anonymous viewer â†’ UNAUTHENTICATED", async () => {
    signedOut();
    await expect(checkAccess(requireModerationAccess)).resolves.toBe("UNAUTHENTICATED");
  });

  it("USER â†’ FORBIDDEN", async () => {
    signedIn(context("USER", []));
    await expect(checkAccess(requireModerationAccess)).resolves.toBe("FORBIDDEN");
  });

  it("MODERATOR and ADMIN keep access", async () => {
    for (const role of ["MODERATOR", "ADMIN"] as const) {
      signedIn(context(role, []));
      await expect(checkAccess(requireModerationAccess)).resolves.toBeNull();
    }
  });
});

describe("admin route contracts (no authz weakening)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const service = read("src/lib/beats/service.ts");
  const beatsPage = read("src/app/admin/beats/page.tsx");
  const beatPage = read("src/app/admin/beats/[id]/page.tsx");
  const moderationPage = read("src/app/admin/moderation/page.tsx");

  function body(fn: string) {
    const start = service.indexOf(`export async function ${fn}`);
    expect(start).toBeGreaterThan(-1);
    const next = service.indexOf("\nexport ", start + 1);
    return service.slice(start, next === -1 ? undefined : next);
  }

  it("data functions keep enforcing the same guards before data access", () => {
    for (const fn of ["listPlatformBeatsForAdmin", "getPlatformBeatForAdmin"]) {
      const b = body(fn);
      expect(b).toMatch("await requireAdminPlatformBeatsAccess();");
      expect(b.indexOf("await requireAdminPlatformBeatsAccess();")).toBeLessThan(
        Math.max(b.indexOf("createSupabaseServerClient()"), b.indexOf("loadBeat(")),
      );
    }
    for (const fn of [
      "listPendingReviewForModeration",
      "listApprovedForModeration",
      "getStaffCommunityBeatForModeration",
    ]) {
      expect(body(fn)).toMatch("await requireModerationAccess();");
    }
    const guard = body("requireAdminPlatformBeatsAccess");
    expect(guard).toMatch("await requireAdminPlatformOps();");
    expect(guard).toMatch('await requirePermission("beats.edit");');
    expect(service).toMatch(/async function requireAdminPlatformOps\(\)[^{]*\{\s*await requireRole\(\["ADMIN"\]\);/);
    expect(body("requireModerationAccess")).toMatch('requireRole(["ADMIN", "MODERATOR"])');
  });

  it("pages resolve the viewer denial before loading data", () => {
    for (const [page, guard, loader] of [
      [beatsPage, "requireAdminPlatformBeatsAccess", "await listPlatformBeatsForAdmin()"],
      [beatPage, "requireAdminPlatformBeatsAccess", "await getPlatformBeatForAdmin(id)"],
      [moderationPage, "requireModerationAccess", "listPendingReviewForModeration(),"],
    ] as const) {
      const check = page.indexOf(`await checkAccess(${guard})`);
      expect(check).toBeGreaterThan(-1);
      expect(page).toMatch('if (denial === "UNAUTHENTICATED") redirect("/sign-in");');
      expect(check).toBeLessThan(page.indexOf(loader));
    }
  });

  it("beat detail keeps NOT_FOUND â†’ notFound and rethrows other errors", () => {
    expect(beatPage).toMatch('error instanceof AuthError && error.code === "NOT_FOUND"');
    expect(beatPage).toMatch(/notFound\(\);\s*\}\s*throw error;/);
  });
});
