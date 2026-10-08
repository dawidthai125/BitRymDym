import type { SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";
import { isPermissionKey } from "@/types/permissions";

/**
 * Pure authorization helpers — reusable server-side.
 * Do not use as the only security boundary; RLS enforces data access.
 */

export function hasPermission(
  granted: readonly string[],
  required: PermissionKey,
): boolean {
  return granted.includes(required);
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  return required.some((key) => hasPermission(granted, key));
}

export function hasRole(
  current: SystemRole,
  allowed: readonly SystemRole[],
): boolean {
  return allowed.includes(current);
}

/**
 * UI-only: whether to show the PLATFORM admin panel nav link.
 * Not a security boundary — /admin/beats still uses requireRole(["ADMIN"]).
 */
export function canAccessAdminNav(
  role: SystemRole | null | undefined,
): boolean {
  if (!role) return false;
  return hasRole(role, ["ADMIN"]);
}

/**
 * UI-only: community „Wrzuć bit” / `/beats/upload` entry.
 * Community upload is USER-role only (page + transport + createUserBeat).
 * Not a security boundary — `/beats/upload` still uses requireRole(["USER"]).
 */
export function canAccessCommunityUpload(
  role: SystemRole | null | undefined,
): boolean {
  if (!role) return false;
  return hasRole(role, ["USER"]);
}

/**
 * UI-only: moderation queue link (ADMIN + MODERATOR).
 * Not a security boundary — /admin/moderation uses requireRole.
 */
export function canAccessModerationNav(
  role: SystemRole | null | undefined,
): boolean {
  if (!role) return false;
  return hasRole(role, ["ADMIN", "MODERATOR"]);
}

export function filterPermissionKeys(values: readonly string[]): PermissionKey[] {
  return values.filter(isPermissionKey);
}

/**
 * Fields that must never be writable by a normal user self-update payload.
 */
export const PROTECTED_PROFILE_FIELDS = [
  "role",
  "account_level",
  "id",
  "user_number",
  "experience_total",
] as const;

export function assertNoPrivilegeEscalationInPayload(
  payload: Record<string, unknown>,
): void {
  for (const field of PROTECTED_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`Forbidden field in profile update: ${field}`);
    }
  }
}
