/**
 * W1 Admin users — assemble read model from SSOT snapshots (pure).
 * Premium via resolveProductEntitlement. Rank via deriveCreatorRank inside resolver.
 */

import type { PremiumEntitlementSnapshot } from "@/lib/audio/effective-entitlement";
import { resolveProductEntitlement } from "@/lib/entitlements/product-entitlement";
import type { CreatorRank } from "@/types/creator-progress";
import type { AccountLevel, SystemRole } from "@/types/domain";
import type { PremiumTier } from "@/types/premium";

export type AdminUserProfileInput = {
  id: string;
  displayName: string | null;
  userNumber: number | null;
  role: SystemRole;
  accountLevel: AccountLevel;
  experienceTotal: number;
};

export type AdminUserRow = {
  id: string;
  displayName: string | null;
  userNumber: number | null;
  email: string | null;
  role: SystemRole;
  rank: CreatorRank;
  premiumTier: PremiumTier;
  premiumExpiresAt: string | null;
};

export function assembleAdminUserRow(params: {
  profile: AdminUserProfileInput;
  premium: PremiumEntitlementSnapshot | null;
  email: string | null;
  nowMs?: number;
}): AdminUserRow {
  const product = resolveProductEntitlement({
    userId: params.profile.id,
    accountLevel: params.profile.accountLevel,
    experienceTotal: params.profile.experienceTotal,
    premium: params.premium,
    nowMs: params.nowMs,
  });

  return {
    id: params.profile.id,
    displayName: params.profile.displayName,
    userNumber: params.profile.userNumber,
    email: params.email,
    role: params.profile.role,
    rank: product.creatorRank ?? "BEGINNER_RAPPER",
    premiumTier: product.premiumTier,
    premiumExpiresAt:
      product.premiumTier === "FREE" ? null : product.premiumExpiresAt,
  };
}

export function assembleAdminUserRows(params: {
  profiles: readonly AdminUserProfileInput[];
  entitlementsByUserId: ReadonlyMap<string, PremiumEntitlementSnapshot>;
  emailsByUserId: ReadonlyMap<string, string>;
  nowMs?: number;
}): AdminUserRow[] {
  return params.profiles.map((profile) =>
    assembleAdminUserRow({
      profile,
      premium: params.entitlementsByUserId.get(profile.id) ?? null,
      email: params.emailsByUserId.get(profile.id) ?? null,
      nowMs: params.nowMs,
    }),
  );
}

export function filterAssembledAdminUsers(
  rows: readonly AdminUserRow[],
  filters: {
    premium: PremiumTier | null;
    q: string;
  },
): AdminUserRow[] {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.premium && row.premiumTier !== filters.premium) return false;
    if (!q) return true;
    const name = (row.displayName ?? "").toLowerCase();
    const email = (row.email ?? "").toLowerCase();
    const number =
      row.userNumber === null || row.userNumber === undefined
        ? ""
        : String(row.userNumber);
    return name.includes(q) || email.includes(q) || number.includes(q);
  });
}
