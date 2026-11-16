import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

import {
  filterPermissionKeys,
  hasPermission,
  hasRole,
} from "@/lib/auth/permissions";
import {
  mapProfileRow,
  PROFILE_SELECT_OWN,
  type AuthContext,
  type ProfileRow,
} from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/env";
import { createSupabaseServerClient, requestUserAccessBearer } from "@/lib/supabase/server";
import type { SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";

/** Profile + role permissions change rarely; short TTL cuts auth DB round-trips on tab switches. */
const AUTH_PROFILE_REVALIDATE_SECONDS = 60;

export class AuthError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

  constructor(code: AuthError["code"], message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

function permissionKeysFromRoleRows(
  data: { permissions: unknown }[] | null,
): PermissionKey[] {
  const keys: string[] = [];
  for (const row of data ?? []) {
    const nested = row.permissions as
      | { key: string }
      | { key: string }[]
      | null;
    if (!nested) continue;
    if (Array.isArray(nested)) {
      nested.forEach((item) => keys.push(item.key));
    } else {
      keys.push(nested.key);
    }
  }
  return filterPermissionKeys(keys);
}

async function loadPermissionsForRole(
  role: SystemRole,
): Promise<PermissionKey[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permissions(key)")
    .eq("role", role);

  if (error) {
    throw new Error(`Failed to load role permissions: ${error.message}`);
  }

  return permissionKeysFromRoleRows(data as { permissions: unknown }[] | null);
}

async function loadAuthContextUncached(
  userId: string,
  email: string | null,
): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_OWN)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const profile = mapProfileRow(data as ProfileRow);
  const permissions = await loadPermissionsForRole(profile.role);

  return {
    userId,
    email,
    profile,
    permissions,
  };
}

/**
 * Cross-request cache for profile + permissions (not Auth getUser).
 * Service-role client keeps the cached callback free of cookies/headers
 * (required by `unstable_cache`). Identity is already proven by getSessionUser().
 * Falls back to the request-scoped client when the service role key is absent.
 */
async function loadAuthContextForUser(
  userId: string,
  email: string | null,
): Promise<AuthContext | null> {
  if (!getSupabaseServiceRoleKey()) {
    return loadAuthContextUncached(userId, email);
  }

  return unstable_cache(
    async () => {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin
        .from("profiles")
        .select(PROFILE_SELECT_OWN)
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load profile: ${error.message}`);
      }
      if (!data) {
        return null;
      }

      const profile = mapProfileRow(data as ProfileRow);
      const { data: permRows, error: permError } = await admin
        .from("role_permissions")
        .select("permissions(key)")
        .eq("role", profile.role);

      if (permError) {
        throw new Error(`Failed to load role permissions: ${permError.message}`);
      }

      return {
        userId,
        email,
        profile,
        permissions: permissionKeysFromRoleRows(
          permRows as { permissions: unknown }[] | null,
        ),
      } satisfies AuthContext;
    },
    ["auth-profile-context", userId, email ?? ""],
    {
      revalidate: AUTH_PROFILE_REVALIDATE_SECONDS,
      tags: [`auth-profile-${userId}`],
    },
  )();
}

export const getSessionUser = cache(async function getSessionUser() {
  if (!getSupabasePublicEnv().isConfigured) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const bearer = await requestUserAccessBearer();
  const { data, error } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
});

export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<AuthContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return loadAuthContextForUser(user.id, user.email ?? null);
});

export async function requireUser(): Promise<AuthContext> {
  const context = await getCurrentProfile();
  if (!context) {
    throw new AuthError("UNAUTHENTICATED", "Authentication required.");
  }
  return context;
}

export async function requireRole(
  allowed: readonly SystemRole[],
): Promise<AuthContext> {
  const context = await requireUser();
  if (!hasRole(context.profile.role, allowed)) {
    throw new AuthError("FORBIDDEN", "Insufficient role.");
  }
  return context;
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<AuthContext> {
  const context = await requireUser();
  if (!hasPermission(context.permissions, permission)) {
    throw new AuthError("FORBIDDEN", "Missing permission.");
  }
  return context;
}
