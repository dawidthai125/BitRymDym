/**
 * W3 Admin users audit history — query parsing only (no I/O).
 */

import { parseAdminUsersPage } from "@/lib/admin/users-query";

export const ADMIN_AUDIT_PAGE_SIZE = 25;

export const ADMIN_AUDIT_ACTIONS = [
  "ROLE_CHANGE",
  "ADMIN_GRANT",
  "ADMIN_REVOKE",
  "MODERATOR_GRANT",
  "MODERATOR_REVOKE",
  "PREMIUM_TIER_CHANGE",
  "PREMIUM_EXPIRATION_CHANGE",
  "USER_ACCOUNT_DELETE",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export type AdminUsersAuditQuery = {
  action: AdminAuditAction | null;
  targetUserNumber: number | null;
  rejectTarget: boolean;
  page: number;
};

function getParam(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? "";
  }
  const v = params[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export function parseAdminAuditAction(
  raw: string | null | undefined,
): AdminAuditAction | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "all") return null;
  return (ADMIN_AUDIT_ACTIONS as readonly string[]).includes(value)
    ? (value as AdminAuditAction)
    : null;
}

export function parseAdminAuditTargetUserNumber(raw: string | null | undefined): {
  targetUserNumber: number | null;
  rejectTarget: boolean;
} {
  const value = String(raw ?? "").trim();
  if (!value) return { targetUserNumber: null, rejectTarget: false };
  if (!/^\d{1,18}$/.test(value)) {
    return { targetUserNumber: null, rejectTarget: true };
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n < 1) {
    return { targetUserNumber: null, rejectTarget: true };
  }
  return { targetUserNumber: n, rejectTarget: false };
}

export function parseAdminUsersAuditQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): AdminUsersAuditQuery {
  const target = parseAdminAuditTargetUserNumber(getParam(params, "auditUser"));
  return {
    action: parseAdminAuditAction(getParam(params, "auditAction")),
    targetUserNumber: target.targetUserNumber,
    rejectTarget: target.rejectTarget,
    page: parseAdminUsersPage(getParam(params, "auditPage")),
  };
}
