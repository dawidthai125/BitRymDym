/**
 * Permission keys from Master SSOT §36 (examples catalog).
 * Do not invent additional keys without Owner decision.
 */

export const SSOT_PERMISSION_KEYS = [
  "users.view",
  "users.edit",
  "users.suspend",
  "beats.create",
  "beats.edit",
  "beats.delete",
  "beats.approve",
  "beats.reject",
  "tracks.view",
  "tracks.moderate",
  "tracks.remove",
  "comments.moderate",
  "comments.delete",
  "reports.view",
  "reports.resolve",
  "payments.view",
  "payments.manage",
  "settings.view",
  "settings.manage",
  "feature_flags.view",
  "feature_flags.manage",
  "audit_log.view",
] as const;

export type PermissionKey = (typeof SSOT_PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (SSOT_PERMISSION_KEYS as readonly string[]).includes(value);
}
