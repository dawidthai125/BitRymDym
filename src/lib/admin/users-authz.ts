/**
 * W2 Admin user mutations — AuthZ (pure). Not a substitute for requireUser.
 */

import { hasPermission, hasRole } from "@/lib/auth/permissions";
import type { SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";

export function canListAdminUsers(
  role: SystemRole | null | undefined,
  permissions: readonly string[] | readonly PermissionKey[],
): boolean {
  if (!role || !hasRole(role, ["ADMIN"])) return false;
  return (
    hasPermission(permissions, "users.view") ||
    hasPermission(permissions, "users.edit")
  );
}

export function canMutateAdminUsers(
  role: SystemRole | null | undefined,
  permissions: readonly string[] | readonly PermissionKey[],
): boolean {
  if (!role || !hasRole(role, ["ADMIN"])) return false;
  return hasPermission(permissions, "users.edit");
}
