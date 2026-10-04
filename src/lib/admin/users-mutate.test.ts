import { describe, expect, it } from "vitest";

import { canListAdminUsers, canMutateAdminUsers } from "@/lib/admin/users-authz";
import {
  lastAdminDemotionDecision,
  parseAdminUsersMutationInput,
  selfDemotionDecision,
  serializedLastAdminRevokes,
  warsawEndOfDayToUtcIso,
} from "@/lib/admin/users-mutate";
import {
  polishAdminUsersMutationError,
  parseAdminUsersMutationErrorCode,
} from "@/lib/admin/users-mutate-errors";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("admin users W2 authz", () => {
  it("USER: role and premium mutation DENY", () => {
    expect(canMutateAdminUsers("USER", ["users.edit", "users.view"])).toBe(false);
  });

  it("MODERATOR: role, premium, ADMIN grant DENY", () => {
    expect(canMutateAdminUsers("MODERATOR", ["users.view", "users.suspend"])).toBe(
      false,
    );
    expect(canListAdminUsers("MODERATOR", ["users.view"])).toBe(false);
  });

  it("ADMIN with users.edit PASS", () => {
    expect(canMutateAdminUsers("ADMIN", ["users.edit"])).toBe(true);
  });

  it("ADMIN without users.edit DENY", () => {
    expect(canMutateAdminUsers("ADMIN", ["users.view"])).toBe(false);
  });
});

describe("admin users W2 payload", () => {
  it("accepts USER→MODERATOR, MODERATOR→USER, USER→ADMIN, ADMIN→USER", () => {
    for (const role of ["MODERATOR", "USER", "ADMIN"] as const) {
      const parsed = parseAdminUsersMutationInput({
        targetUserId: A,
        role,
        premiumTier: "FREE",
        expiresOn: "",
      });
      expect(parsed.ok).toBe(true);
    }
  });

  it("Premium FREE/BRONZE/SILVER/GOLD + NULL expiration", () => {
    for (const tier of ["FREE", "BRONZE", "SILVER", "GOLD"] as const) {
      const parsed = parseAdminUsersMutationInput({
        targetUserId: A,
        role: "USER",
        premiumTier: tier,
        expiresOn: "",
      });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value.expiresAt).toBeNull();
    }
  });

  it("future Warsaw end-of-day expiration PASS", () => {
    const parsed = parseAdminUsersMutationInput(
      {
        targetUserId: A,
        role: "USER",
        premiumTier: "GOLD",
        expiresOn: "2027-01-15",
      },
      Date.parse("2026-10-04T12:00:00.000Z"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.expiresAt).toBe("2027-01-15T22:59:59.000Z");
    }
  });

  it("past expiration DENY", () => {
    const parsed = parseAdminUsersMutationInput(
      {
        targetUserId: A,
        role: "USER",
        premiumTier: "GOLD",
        expiresOn: "2020-01-01",
      },
      Date.parse("2026-10-04T12:00:00.000Z"),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("INVALID_EXPIRATION");
  });

  it("now expiration DENY (today already ended)", () => {
    const parsed = parseAdminUsersMutationInput(
      {
        targetUserId: A,
        role: "USER",
        premiumTier: "SILVER",
        expiresOn: "2026-10-04",
      },
      Date.parse("2026-10-04T22:00:00.000Z"),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("INVALID_EXPIRATION");
  });

  it("FREE + expiration DENY", () => {
    const parsed = parseAdminUsersMutationInput({
      targetUserId: A,
      role: "USER",
      premiumTier: "FREE",
      expiresOn: "2027-01-01",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("INVALID_EXPIRATION");
  });

  it("invalid role / tier DENY", () => {
    expect(
      parseAdminUsersMutationInput({
        targetUserId: A,
        role: "OWNER",
        premiumTier: "GOLD",
      }).ok,
    ).toBe(false);
    expect(
      parseAdminUsersMutationInput({
        targetUserId: A,
        role: "USER",
        premiumTier: "PLATINUM",
      }).ok,
    ).toBe(false);
  });
});

describe("admin users W2 Warsaw expiry", () => {
  it("maps summer and winter dates to timestamptz UTC", () => {
    expect(warsawEndOfDayToUtcIso("2026-10-04")).toBe("2026-10-04T21:59:59.000Z");
    expect(warsawEndOfDayToUtcIso("2026-12-04")).toBe("2026-12-04T22:59:59.000Z");
  });
});

describe("admin users W2 self-demotion", () => {
  it("self USER/MODERATOR DENY", () => {
    expect(
      selfDemotionDecision({ actorId: A, targetId: A, nextRole: "USER" }),
    ).toBe("SELF_DEMOTION_FORBIDDEN");
    expect(
      selfDemotionDecision({
        actorId: A,
        targetId: A,
        nextRole: "MODERATOR",
      }),
    ).toBe("SELF_DEMOTION_FORBIDDEN");
  });

  it("self ADMIN→ADMIN NO_OP", () => {
    expect(
      selfDemotionDecision({ actorId: A, targetId: A, nextRole: "ADMIN" }),
    ).toBe("NO_OP");
  });

  it("other target PASS", () => {
    expect(
      selfDemotionDecision({ actorId: A, targetId: B, nextRole: "USER" }),
    ).toBe("PASS");
  });
});

describe("admin users W2 last-admin", () => {
  it("denies demoting the only ADMIN", () => {
    expect(
      lastAdminDemotionDecision({
        adminIds: [A],
        targetId: A,
        currentRole: "ADMIN",
        nextRole: "USER",
      }),
    ).toBe("LAST_ADMIN_PROTECTED");
    expect(
      lastAdminDemotionDecision({
        adminIds: [A],
        targetId: A,
        currentRole: "ADMIN",
        nextRole: "MODERATOR",
      }),
    ).toBe("LAST_ADMIN_PROTECTED");
  });

  it("allows demotion when another ADMIN remains", () => {
    expect(
      lastAdminDemotionDecision({
        adminIds: [A, B],
        targetId: A,
        currentRole: "ADMIN",
        nextRole: "USER",
      }),
    ).toBe("PASS");
  });

  it("two concurrent last-admin revokes: first PASS second DENY", () => {
    expect(serializedLastAdminRevokes([A, B])).toEqual({
      first: "PASS",
      second: "LAST_ADMIN_PROTECTED",
    });
  });
});

describe("admin users W2 error mapping", () => {
  it("maps codes to Polish without leaking postgres text", () => {
    expect(polishAdminUsersMutationError("LAST_ADMIN_PROTECTED")).toBe(
      "Nie można zdegradować ostatniego administratora.",
    );
    expect(polishAdminUsersMutationError("SELF_DEMOTION_FORBIDDEN")).toBe(
      "Nie możesz zmienić własnej roli.",
    );
    expect(
      parseAdminUsersMutationErrorCode(
        'duplicate key value violates unique constraint "x"',
      ),
    ).toBe("MUTATION_FAILED");
    expect(
      parseAdminUsersMutationErrorCode(
        "P0001: LAST_ADMIN_PROTECTED",
      ),
    ).toBe("LAST_ADMIN_PROTECTED");
  });
});
