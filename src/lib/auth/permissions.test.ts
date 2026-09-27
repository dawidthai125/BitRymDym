import { describe, expect, it } from "vitest";

import {
  assertNoPrivilegeEscalationInPayload,
  canAccessAdminNav,
  canAccessModerationNav,
  hasAnyPermission,
  hasPermission,
  hasRole,
} from "@/lib/auth/permissions";
import { SSOT_PERMISSION_KEYS } from "@/types/permissions";

describe("authorization helpers", () => {
  it("grants permission when present", () => {
    expect(hasPermission(["users.view", "beats.create"], "users.view")).toBe(
      true,
    );
  });

  it("denies missing permission", () => {
    expect(hasPermission(["users.view"], "settings.manage")).toBe(false);
  });

  it("checks any permission", () => {
    expect(
      hasAnyPermission(["comments.moderate"], ["beats.approve", "comments.moderate"]),
    ).toBe(true);
  });

  it("checks roles without conflating account levels", () => {
    expect(hasRole("USER", ["USER", "ADMIN"])).toBe(true);
    expect(hasRole("USER", ["ADMIN"])).toBe(false);
  });

  it("shows admin nav only for ADMIN (UI helper, not AuthZ)", () => {
    expect(canAccessAdminNav("ADMIN")).toBe(true);
    expect(canAccessAdminNav("USER")).toBe(false);
    expect(canAccessAdminNav("MODERATOR")).toBe(false);
    expect(canAccessAdminNav(null)).toBe(false);
    expect(canAccessAdminNav(undefined)).toBe(false);
  });

  it("shows moderation nav for ADMIN and MODERATOR", () => {
    expect(canAccessModerationNav("ADMIN")).toBe(true);
    expect(canAccessModerationNav("MODERATOR")).toBe(true);
    expect(canAccessModerationNav("USER")).toBe(false);
    expect(canAccessModerationNav(null)).toBe(false);
  });

  it("blocks privilege fields in self-update payload", () => {
    expect(() =>
      assertNoPrivilegeEscalationInPayload({ role: "ADMIN" }),
    ).toThrow(/Forbidden field/);
    expect(() =>
      assertNoPrivilegeEscalationInPayload({ account_level: "LEGEND_RAPPER" }),
    ).toThrow(/Forbidden field/);
    expect(() =>
      assertNoPrivilegeEscalationInPayload({ display_name: "Rapper" }),
    ).not.toThrow();
  });

  it("keeps permission catalog aligned with SSOT §36 examples + community publish", () => {
    expect(SSOT_PERMISSION_KEYS).toContain("users.view");
    expect(SSOT_PERMISSION_KEYS).toContain("audit_log.view");
    expect(SSOT_PERMISSION_KEYS).toContain("beats.publish");
    expect(SSOT_PERMISSION_KEYS).not.toContain("superuser.all");
    expect(SSOT_PERMISSION_KEYS).not.toContain("beats.create_own");
  });
});
