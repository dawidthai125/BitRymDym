/**
 * W3 Admin users audit history — READ-ONLY server path.
 * SELECT only. No INSERT / UPDATE / DELETE.
 */

import "server-only";

import { canReadAdminUsersAudit } from "@/lib/admin/users-authz";
import {
  ADMIN_AUDIT_PAGE_SIZE,
  type AdminUsersAuditQuery,
} from "@/lib/admin/users-audit-query";
import {
  presentAdminAuditEvent,
  type AdminAuditRow,
} from "@/lib/admin/users-audit-present";
import { AuthError, requirePermission, requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AUDIT_SELECT =
  "id, actor_user_id, target_user_id, actor_user_number, target_user_number, action, old_value, new_value, created_at" as const;

export type AdminUsersAuditListResult = {
  rows: AdminAuditRow[];
  total: number;
  page: number;
  pageCount: number;
};

type AuditDbRow = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  actor_user_number: number | string | null;
  target_user_number: number | string | null;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export async function requireAdminUsersAuditAccess() {
  const byRole = await requireRole(["ADMIN"]);
  const byPermission = await requirePermission("audit_log.view");
  if (
    byRole.userId !== byPermission.userId ||
    !canReadAdminUsersAudit(byRole.profile.role, byRole.permissions)
  ) {
    throw new AuthError("FORBIDDEN", "ADMIN_FORBIDDEN");
  }
  return byRole;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function applyAuditFilters(
  request: ReturnType<ReturnType<typeof createSupabaseAdminClient>["from"]>,
  query: AdminUsersAuditQuery,
) {
  let next = request
    .select(AUDIT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (query.action) {
    next = next.eq("action", query.action);
  }
  if (query.targetUserNumber != null) {
    next = next.eq("target_user_number", query.targetUserNumber);
  }
  return next;
}

export async function listAdminUserAuditEvents(
  query: AdminUsersAuditQuery,
): Promise<AdminUsersAuditListResult> {
  await requireAdminUsersAuditAccess();

  if (query.rejectTarget) {
    return { rows: [], total: 0, page: 1, pageCount: 1 };
  }

  const admin = createSupabaseAdminClient();
  const requestedPage = Math.max(1, query.page);
  const from = (requestedPage - 1) * ADMIN_AUDIT_PAGE_SIZE;
  const to = from + ADMIN_AUDIT_PAGE_SIZE - 1;

  const first = await applyAuditFilters(
    admin.from("admin_audit_events"),
    query,
  ).range(from, to);

  if (first.error) {
    throw new Error("admin_users_audit_load_failed");
  }

  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_AUDIT_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  let rowsData = (first.data ?? []) as AuditDbRow[];
  if (page !== requestedPage && total > 0) {
    const retryFrom = (page - 1) * ADMIN_AUDIT_PAGE_SIZE;
    const retryTo = retryFrom + ADMIN_AUDIT_PAGE_SIZE - 1;
    const retried = await applyAuditFilters(
      admin.from("admin_audit_events"),
      query,
    ).range(retryFrom, retryTo);
    if (retried.error) {
      throw new Error("admin_users_audit_load_failed");
    }
    rowsData = (retried.data ?? []) as AuditDbRow[];
  }

  const targetIds = [
    ...new Set(
      rowsData
        .map((row) => row.target_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string | null>();
  if (targetIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", targetIds);
    if (profilesError) {
      throw new Error("admin_users_audit_load_failed");
    }
    for (const profile of profiles ?? []) {
      names.set(String(profile.id), profile.display_name ?? null);
    }
  }

  const rows: AdminAuditRow[] = rowsData.map((row) =>
    presentAdminAuditEvent({
      id: String(row.id),
      createdAt: String(row.created_at ?? ""),
      action: String(row.action ?? ""),
      actorUserId: row.actor_user_id,
      targetUserId: row.target_user_id,
      actorUserNumber: toNumber(row.actor_user_number),
      targetUserNumber: toNumber(row.target_user_number),
      oldValue: row.old_value,
      newValue: row.new_value,
      targetDisplayName: row.target_user_id
        ? (names.get(row.target_user_id) ?? null)
        : null,
    }),
  );

  return { rows, total, page, pageCount };
}
