import { describe, expect, it } from "vitest";

import {
  MAX_ACTIVE_BEAT_ACCESS_GRANTS,
  isBeatAccessGrantActive,
} from "@/config/beat-access-grants";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import { rejectGrantClientPrivilegeFields } from "@/lib/grants/grant-input";
import {
  assertTakeRecordAccess,
  TakeAuthzError,
} from "@/lib/takes/authz";

function ctx(
  level: AuthContext["profile"]["accountLevel"] = "BEGINNER_RAPPER",
): AuthContext {
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return {
    userId,
    email: "a@test",
    profile: {
      id: userId,
      displayName: "A",
      role: "USER",
      accountLevel: level,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

describe("Wave 5 — ACTIVE grant predicate", () => {
  it("locks max active grants at 20", () => {
    expect(MAX_ACTIVE_BEAT_ACCESS_GRANTS).toBe(20);
  });

  it("treats null expiry + null revoke as active", () => {
    expect(
      isBeatAccessGrantActive({ revokedAt: null, expiresAt: null }),
    ).toBe(true);
  });

  it("revoked is inactive", () => {
    expect(
      isBeatAccessGrantActive({
        revokedAt: new Date().toISOString(),
        expiresAt: null,
      }),
    ).toBe(false);
  });

  it("expired is inactive", () => {
    expect(
      isBeatAccessGrantActive({
        revokedAt: null,
        expiresAt: "2000-01-01T00:00:00.000Z",
        nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("future expiry is active", () => {
    expect(
      isBeatAccessGrantActive({
        revokedAt: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
        nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

describe("Wave 5 — RECORD AuthZ (assertTakeRecordAccess)", () => {
  it("ALLOW: PUBLISHED + entitlement without grant (W4 path)", () => {
    const result = assertTakeRecordAccess({
      context: ctx("BEGINNER_RAPPER"),
      beat: { id: "b", status: "PUBLISHED", durationSeconds: 90 },
    });
    expect(result.maxRecordingSeconds).toBe(30);
    expect(result.accessSource).toBe("PUBLIC_PUBLISHED");
  });

  it("ALLOW: PUBLISHED + active grant labels GRANT_RECORD", () => {
    const result = assertTakeRecordAccess({
      context: ctx("PRO_RAPPER"),
      beat: { id: "b", status: "PUBLISHED", durationSeconds: 60 },
      activeRecordGrant: true,
    });
    expect(result.maxRecordingSeconds).toBe(60);
    expect(result.accessSource).toBe("GRANT_RECORD");
  });

  it("DENY: non-PUBLISHED even with grant", () => {
    expect(() =>
      assertTakeRecordAccess({
        context: ctx(),
        beat: { id: "b", status: "DRAFT", durationSeconds: 60 },
        activeRecordGrant: true,
      }),
    ).toThrow(TakeAuthzError);
  });

  it("grant does not raise BEGINNER max seconds", () => {
    const result = assertTakeRecordAccess({
      context: ctx("BEGINNER_RAPPER"),
      beat: { id: "b", status: "PUBLISHED", durationSeconds: 180 },
      activeRecordGrant: true,
    });
    expect(result.maxRecordingSeconds).toBe(30);
  });

  it("unauthenticated DENY", () => {
    const bare = ctx();
    bare.userId = "";
    expect(() =>
      assertTakeRecordAccess({
        context: bare,
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 30 },
      }),
    ).toThrow(TakeAuthzError);
  });
});

describe("Wave 5 — client privilege injection", () => {
  it("rejects can_record / granted_by / capability bags", () => {
    expect(() =>
      rejectGrantClientPrivilegeFields({ can_record: false }),
    ).toThrow(AuthError);
    expect(() =>
      rejectGrantClientPrivilegeFields({ grantedBy: "x" }),
    ).toThrow(AuthError);
    expect(() =>
      rejectGrantClientPrivilegeFields({ canPlayback: true }),
    ).toThrow(AuthError);
    expect(() =>
      rejectGrantClientPrivilegeFields({ granteeUserId: "ok" }),
    ).not.toThrow();
  });
});
