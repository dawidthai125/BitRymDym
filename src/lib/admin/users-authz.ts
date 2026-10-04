/**
 * W1 Admin users list AuthZ (pure). Not a substitute for requireUser on the route.
 * MODERATOR may have users.view in the catalog — W0 still DENY user management.
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
