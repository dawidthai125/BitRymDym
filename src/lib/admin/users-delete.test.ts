import { describe, expect, it } from "vitest";

import { canDeleteAdminUsers, canMutateAdminUsers } from "@/lib/admin/users-authz";
import {
  lastAdminDeleteDecision,
  selfDeleteDecision,
  serializedLastAdminDeleteThenDemote,
} from "@/lib/admin/users-delete-guards";
import {
  polishAdminUsersDeleteError,
  parseAdminUsersDeleteErrorCode,
} from "@/lib/admin/users-delete-errors";
import {
  parseAdminDeleteReason,
  parseAdminDeleteTargetUserId,
} from "@/lib/admin/users-delete-reason";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("admin users W4 AuthZ", () => {
  it("ADMIN with users.edit allow", () => {
    expect(canDeleteAdminUsers("ADMIN", ["users.edit"])).toBe(true);
    expect(canMutateAdminUsers("ADMIN", ["users.edit"])).toBe(true);
  });

  it("USER deny", () => {
    expect(canDeleteAdminUsers("USER", ["users.edit", "users.view"])).toBe(false);
  });

  it("MODERATOR deny even with users.suspend", () => {
    expect(
      canDeleteAdminUsers("MODERATOR", ["users.suspend", "users.view", "users.edit"]),
    ).toBe(false);
  });

  it("unauthenticated deny", () => {
    expect(canDeleteAdminUsers(null, ["users.edit"])).toBe(false);
    expect(canDeleteAdminUsers(undefined, ["users.edit"])).toBe(false);
  });

  it("ADMIN without users.edit deny", () => {
    expect(canDeleteAdminUsers("ADMIN", ["users.view"])).toBe(false);
  });
});

describe("admin users W4 self / last-admin", () => {
  it("admin cannot delete self", () => {
    expect(selfDeleteDecision({ actorId: A, targetId: A })).toBe(
      "SELF_DELETE_FORBIDDEN",
    );
    expect(selfDeleteDecision({ actorId: A, targetId: B })).toBe("PASS");
  });

  it("last admin cannot be deleted", () => {
    expect(
      lastAdminDeleteDecision({
        adminIds: [A],
        targetId: A,
        targetRole: "ADMIN",
      }),
    ).toBe("LAST_ADMIN_PROTECTED");
  });

  it("admin can delete another admin if two remain", () => {
    expect(
      lastAdminDeleteDecision({
        adminIds: [A, B],
        targetId: A,
        targetRole: "ADMIN",
      }),
    ).toBe("PASS");
  });

  it("non-admin target is not last-admin protected", () => {
    expect(
      lastAdminDeleteDecision({
        adminIds: [A],
        targetId: B,
        targetRole: "USER",
      }),
    ).toBe("PASS");
  });

  it("delete then demote of remaining last admin is protected", () => {
    expect(serializedLastAdminDeleteThenDemote([A, B])).toEqual({
      deleteFirst: "PASS",
      demoteSecond: "LAST_ADMIN_PROTECTED",
    });
  });
});

describe("admin users W4 reason", () => {
  it("rejects empty, short, long, control, and HTML", () => {
    expect(parseAdminDeleteReason("").ok).toBe(false);
    expect(parseAdminDeleteReason("         ").ok).toBe(false);
    expect(parseAdminDeleteReason("123456789").ok).toBe(false);
    expect(parseAdminDeleteReason("x".repeat(501)).ok).toBe(false);
    expect(parseAdminDeleteReason("ok reason\u0001here").ok).toBe(false);
    expect(parseAdminDeleteReason("powód <b>html</b>").ok).toBe(false);
    expect(parseAdminDeleteReason(null).ok).toBe(false);
  });

  it("accepts 10 and 500 chars", () => {
    expect(parseAdminDeleteReason("1234567890").ok).toBe(true);
    expect(parseAdminDeleteReason("x".repeat(500)).ok).toBe(true);
  });

  it("trims valid reason", () => {
    const parsed = parseAdminDeleteReason("  powód usunięcia konta  ");
    expect(parsed).toEqual({ ok: true, value: "powód usunięcia konta" });
  });
});

describe("admin users W4 target id", () => {
  it("rejects missing and forged identity payloads", () => {
    expect(parseAdminDeleteTargetUserId("").ok).toBe(false);
    expect(parseAdminDeleteTargetUserId("not-a-uuid").ok).toBe(false);
    expect(parseAdminDeleteTargetUserId({ id: A }).ok).toBe(false);
  });

  it("accepts uuid locator only", () => {
    expect(parseAdminDeleteTargetUserId(A)).toEqual({ ok: true, value: A });
  });
});

describe("admin users W4 error mapping", () => {
  it("maps codes to Polish without postgres/resend text", () => {
    expect(polishAdminUsersDeleteError("SELF_DELETE_FORBIDDEN")).toMatch(
      /własnego konta/,
    );
    expect(polishAdminUsersDeleteError("LAST_ADMIN_PROTECTED")).toMatch(
      /ostatniego administratora/,
    );
    expect(
      parseAdminUsersDeleteErrorCode('P0001: SELF_DELETE_FORBIDDEN'),
    ).toBe("SELF_DELETE_FORBIDDEN");
    expect(
      parseAdminUsersDeleteErrorCode("resend 401 unauthorized api"),
    ).toBe("MUTATION_FAILED");
  });
});
