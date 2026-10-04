/**
 * W1 Admin users list — READ-ONLY server path.
 * Mutations of role / premium are forbidden here (W2).
 */

import "server-only";

import { canListAdminUsers } from "@/lib/admin/users-authz";
import {
  assembleAdminUserRows,
  filterAssembledAdminUsers,
  type AdminUserProfileInput,
  type AdminUserRow,
} from "@/lib/admin/users-assemble";
import {
  ADMIN_USERS_MAX_SCAN,
  ADMIN_USERS_PAGE_SIZE,
  escapeIlikePattern,
  isDigitsUserNumberQuery,
  paginateSlice,
  type AdminUsersQuery,
} from "@/lib/admin/users-query";
import type { PremiumEntitlementSnapshot } from "@/lib/audio/effective-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { experienceBoundsForRank } from "@/lib/creator-progress/rank";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/types/premium";
import type { AccountLevel, SystemRole } from "@/types/domain";

const PROFILE_SELECT_ADMIN_USERS =
  "id, display_name, user_number, role, account_level, experience_total" as const;

export type AdminUsersListResult = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageCount: number;
  truncated: boolean;
};

export async function requireAdminUsersListAccess() {
  const context = await requireUser();
  if (!canListAdminUsers(context.profile.role, context.permissions)) {
    throw new AuthError("FORBIDDEN", "Insufficient role.");
  }
  return context;
}

function mapProfile(row: {
  id: string;
  display_name: string | null;
  user_number: number | null;
  role: SystemRole;
  account_level: AccountLevel;
  experience_total: number;
}): AdminUserProfileInput {
  return {
    id: row.id,
    displayName: row.display_name,
    userNumber:
      row.user_number === null || row.user_number === undefined
        ? null
        : Number(row.user_number),
    role: row.role,
    accountLevel: row.account_level,
    experienceTotal:
      typeof row.experience_total === "number" &&
      Number.isFinite(row.experience_total)
        ? Math.max(0, Math.floor(row.experience_total))
        : 0,
  };
}

async function loadAuthEmailMap(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const perPage = 200;
  const maxPages = Math.ceil(ADMIN_USERS_MAX_SCAN / perPage);
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error("admin_users_email_load_failed");
    }
    const users = data.users ?? [];
    for (const user of users) {
      if (user.email) map.set(user.id, user.email);
    }
    if (users.length < perPage) break;
  }
  return map;
}

export async function listAdminUsers(
  query: AdminUsersQuery,
  nowMs: number = Date.now(),
): Promise<AdminUsersListResult> {
  await requireAdminUsersListAccess();

  const admin = createSupabaseAdminClient();
  const emailsByUserId = await loadAuthEmailMap(admin);

  let request = admin
    .from("profiles")
    .select(PROFILE_SELECT_ADMIN_USERS)
    .order("user_number", { ascending: true, nullsFirst: false })
    .limit(ADMIN_USERS_MAX_SCAN);

  if (query.role) {
    request = request.eq("role", query.role);
  }

  if (query.rank) {
    const bounds = experienceBoundsForRank(query.rank);
    request = request.gte("experience_total", bounds.minInclusive);
    if (bounds.maxExclusive !== null) {
      request = request.lt("experience_total", bounds.maxExclusive);
    }
  }

  const q = query.q;
  if (q.includes("@")) {
    const needle = q.toLowerCase();
    const emailIds = [...emailsByUserId.entries()]
      .filter(([, email]) => email.toLowerCase().includes(needle))
      .map(([id]) => id);
    if (emailIds.length === 0) {
      return { rows: [], total: 0, page: 1, pageCount: 1, truncated: false };
    }
    request = request.in("id", emailIds.slice(0, ADMIN_USERS_MAX_SCAN));
  } else if (q) {
    const pattern = `%${escapeIlikePattern(q)}%`;
    if (isDigitsUserNumberQuery(q)) {
      request = request.or(
        `display_name.ilike.${pattern},user_number.eq.${q}`,
      );
    } else {
      request = request.ilike("display_name", pattern);
    }
  }

  const { data, error } = await request;
  if (error) {
    throw new Error("admin_users_profile_load_failed");
  }

  const truncated = (data?.length ?? 0) >= ADMIN_USERS_MAX_SCAN;
  const profiles = (data ?? []).map((row) =>
    mapProfile(
      row as {
        id: string;
        display_name: string | null;
        user_number: number | null;
        role: SystemRole;
        account_level: AccountLevel;
        experience_total: number;
      },
    ),
  );

  const ids = profiles.map((p) => p.id);
  const entitlementsByUserId = new Map<string, PremiumEntitlementSnapshot>();
  if (ids.length > 0) {
    const { data: entitlementRows, error: entitlementError } = await admin
      .from("premium_entitlements")
      .select("user_id, active, source, expires_at, tier")
      .eq("active", true)
      .in("user_id", ids);

    if (entitlementError) {
      throw new Error("admin_users_premium_load_failed");
    }

    for (const row of entitlementRows ?? []) {
      const userId = String(row.user_id);
      entitlementsByUserId.set(userId, {
        userId,
        active: Boolean(row.active),
        source: String(row.source ?? ""),
        expiresAt:
          typeof row.expires_at === "string" ? row.expires_at : null,
        tier: isPremiumTier(row.tier) ? row.tier : null,
      });
    }
  }

  const assembled = assembleAdminUserRows({
    profiles,
    entitlementsByUserId,
    emailsByUserId,
    nowMs,
  });

  const filtered = filterAssembledAdminUsers(assembled, {
    premium: query.premium,
    q: query.q,
  });

  const page = paginateSlice(filtered, query.page, ADMIN_USERS_PAGE_SIZE);
  return {
    ...page,
    truncated,
  };
}
