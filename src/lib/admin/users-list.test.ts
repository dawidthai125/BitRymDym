import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canListAdminUsers } from "@/lib/admin/users-authz";
import {
  assembleAdminUserRow,
  filterAssembledAdminUsers,
} from "@/lib/admin/users-assemble";
import {
  escapeIlikePattern,
  paginateSlice,
  parseAdminUsersQuery,
} from "@/lib/admin/users-query";
import { CREATOR_RANKS } from "@/types/creator-progress";
import {
  deriveCreatorRank,
  experienceBoundsForRank,
} from "@/lib/creator-progress/rank";
import {
  labelCreatorRank,
  labelPremiumTier,
  labelSystemRole,
} from "@/lib/ui/labels";

function profile(overrides: Partial<Parameters<typeof assembleAdminUserRow>[0]["profile"]> = {}) {
  return {
    id: "user-1",
    displayName: "Dawid",
    userNumber: 1,
    role: "USER" as const,
    accountLevel: "BEGINNER_RAPPER" as const,
    experienceTotal: 0,
    ...overrides,
  };
}

describe("admin users W1 authz", () => {
  it("allows ADMIN with users.view", () => {
    expect(canListAdminUsers("ADMIN", ["users.view"])).toBe(true);
  });

  it("allows ADMIN with users.edit without view", () => {
    expect(canListAdminUsers("ADMIN", ["users.edit"])).toBe(true);
  });

  it("denies USER even with users.view spoofed in array", () => {
    expect(canListAdminUsers("USER", ["users.view", "users.edit"])).toBe(false);
  });

  it("denies MODERATOR even when catalog includes users.view", () => {
    expect(canListAdminUsers("MODERATOR", ["users.view", "users.suspend"])).toBe(
      false,
    );
  });

  it("denies ADMIN without users.view or users.edit", () => {
    expect(canListAdminUsers("ADMIN", ["beats.create"])).toBe(false);
  });
});

describe("admin users W1 query", () => {
  it("parses filters and clamps search length", () => {
    const q = parseAdminUsersQuery(
      new URLSearchParams({
        q: "  dawid@example.com  ",
        role: "ADMIN",
        premium: "GOLD",
        rank: "ELITE_RAPPER",
        page: "2",
      }),
    );
    expect(q.q).toBe("dawid@example.com");
    expect(q.role).toBe("ADMIN");
    expect(q.premium).toBe("GOLD");
    expect(q.rank).toBe("ELITE_RAPPER");
    expect(q.page).toBe(2);
  });

  it("rejects unknown enum filters as all", () => {
    const q = parseAdminUsersQuery({
      role: "ADMINISTRATOR",
      premium: "PLATINUM",
      rank: "GOD",
      page: "0",
    });
    expect(q.role).toBeNull();
    expect(q.premium).toBeNull();
    expect(q.rank).toBeNull();
    expect(q.page).toBe(1);
  });

  it("escapes ilike wildcards", () => {
    expect(escapeIlikePattern("a%b_c")).toBe("a\\%b\\_c");
  });

  it("paginates without sending extra rows", () => {
    const page = paginateSlice([1, 2, 3, 4, 5], 2, 2);
    expect(page.rows).toEqual([3, 4]);
    expect(page.total).toBe(5);
    expect(page.pageCount).toBe(3);
  });
});

describe("admin users W1 read model", () => {
  it("maps role, rank, user_number, email, and resolved premium", () => {
    const row = assembleAdminUserRow({
      profile: profile({ experienceTotal: 2500, role: "MODERATOR" }),
      email: "mod@example.com",
      premium: {
        userId: "user-1",
        active: true,
        source: "admin_grant",
        expiresAt: "2027-01-01T00:00:00.000Z",
        tier: "GOLD",
      },
      nowMs: Date.parse("2026-10-04T00:00:00.000Z"),
    });
    expect(row.email).toBe("mod@example.com");
    expect(row.role).toBe("MODERATOR");
    expect(row.rank).toBe("PRO_RAPPER");
    expect(row.userNumber).toBe(1);
    expect(row.premiumTier).toBe("GOLD");
    expect(row.premiumExpiresAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("treats missing entitlement as FREE without inventing premium_active SSOT", () => {
    const row = assembleAdminUserRow({
      profile: profile(),
      email: null,
      premium: null,
    });
    expect(row.premiumTier).toBe("FREE");
    expect(row.premiumExpiresAt).toBeNull();
  });

  it("filters premium and search on assembled rows", () => {
    const gold = assembleAdminUserRow({
      profile: profile({ displayName: "Kubi", userNumber: 12 }),
      email: "kubi@bitrymdym.pl",
      premium: {
        userId: "user-1",
        active: true,
        source: "x",
        expiresAt: null,
        tier: "GOLD",
      },
    });
    const free = assembleAdminUserRow({
      profile: profile({
        id: "user-2",
        displayName: "Inny",
        userNumber: 3,
      }),
      email: "inny@example.com",
      premium: null,
    });
    expect(
      filterAssembledAdminUsers([gold, free], { premium: "GOLD", q: "" }).map(
        (r) => r.userNumber,
      ),
    ).toEqual([12]);
    expect(
      filterAssembledAdminUsers([gold, free], { premium: null, q: "kubi@" }).map(
        (r) => r.displayName,
      ),
    ).toEqual(["Kubi"]);
    expect(
      filterAssembledAdminUsers([gold, free], { premium: null, q: "12" }).map(
        (r) => r.displayName,
      ),
    ).toEqual(["Kubi"]);
  });
});

describe("admin users W1 rank bounds reuse thresholds", () => {
  it("experience windows match deriveCreatorRank", () => {
    for (const rank of CREATOR_RANKS) {
      const { minInclusive, maxExclusive } = experienceBoundsForRank(rank);
      expect(deriveCreatorRank(minInclusive)).toBe(rank);
      if (maxExclusive !== null) {
        expect(deriveCreatorRank(maxExclusive - 1)).toBe(rank);
        expect(deriveCreatorRank(maxExclusive)).not.toBe(rank);
      }
    }
  });
});

describe("admin users W1 presentation", () => {
  it("maps canonical enums to Polish / product labels", () => {
    expect(labelSystemRole("ADMIN")).toBe("Administrator");
    expect(labelSystemRole("USER")).toBe("Użytkownik");
    expect(labelPremiumTier("GOLD")).toBe("Gold");
    expect(labelCreatorRank("RISING_RAPPER")).toBe("Wschodzący");
  });
});

describe("admin users W1 no mutation path", () => {
  it("list module is select/listUsers only", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/admin/users-list.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).toMatch(/READ-ONLY/);
  });
});

describe("admin users W1 page copy", () => {
  it("maps empty and error states without raw exception text", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/admin/users/page.tsx"),
      "utf8",
    );
    expect(src).toMatch("Brak użytkowników.");
    expect(src).toMatch("Nie znaleziono użytkowników dla podanych filtrów.");
    expect(src).toMatch("Nie udało się pobrać listy użytkowników.");
    expect(src).not.toMatch("error.message");
    expect(src).toMatch("if (error instanceof AuthError) throw error");
  });

  it("gates the route with requireAdminUsersListAccess", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/admin/users/layout.tsx"),
      "utf8",
    );
    expect(src).toMatch("requireAdminUsersListAccess");
    expect(src).toMatch("Brak dostępu");
  });
});
