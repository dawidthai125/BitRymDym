import "server-only";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

import {
  filterPermissionKeys,
  hasPermission,
  hasRole,
} from "@/lib/auth/permissions";
import { mapProfileRow, type AuthContext, type ProfileRow } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";

export class AuthError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

  constructor(code: AuthError["code"], message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
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

export async function getSessionUser() {
  if (!getSupabasePublicEnv().isConfigured) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

export async function getCurrentProfile(): Promise<AuthContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, account_level, created_at, updated_at")
    .eq("id", user.id)
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
    userId: user.id,
    email: user.email ?? null,
    profile,
    permissions,
  };
}

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
