"use server";

import { revalidatePath } from "next/cache";

import { canDeleteAdminUsers, canMutateAdminUsers } from "@/lib/admin/users-authz";
import { parseAdminUsersMutationInput } from "@/lib/admin/users-mutate";
import {
  polishAdminUsersMutationError,
  parseAdminUsersMutationErrorCode,
  type AdminUsersMutationCode,
} from "@/lib/admin/users-mutate-errors";
import {
  polishAdminUsersDeleteError,
  parseAdminUsersDeleteErrorCode,
  type AdminUsersDeleteCode,
} from "@/lib/admin/users-delete-errors";
import {
  parseAdminDeleteReason,
  parseAdminDeleteTargetUserId,
} from "@/lib/admin/users-delete-reason";
import { executeAccountProfile01Deletion } from "@/lib/auth/delete-account";
import { AuthError, requirePermission, requireRole } from "@/lib/auth/session";
import { sendAdminAccountDeletionEmail } from "@/lib/email/send-admin-account-deletion-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SystemRole } from "@/types/domain";

export type AdminUsersMutationState = {
  success: boolean;
  error: string | null;
  code: AdminUsersMutationCode | null;
};

async function requireAdminUsersMutateAccess() {
  const byRole = await requireRole(["ADMIN"]);
  const byPermission = await requirePermission("users.edit");
  if (
    byRole.userId !== byPermission.userId ||
    !canMutateAdminUsers(byRole.profile.role, byRole.permissions)
  ) {
    throw new AuthError("FORBIDDEN", "ADMIN_FORBIDDEN");
  }
  return byRole;
}

export type AdminUsersDeleteState = {
  success: boolean;
  error: string | null;
  code: AdminUsersDeleteCode | null;
};

type DeletableAssert = {
  ok?: boolean;
  targetRole?: SystemRole;
  targetUserNumber?: number | string | null;
  actorUserNumber?: number | string | null;
  premiumActive?: boolean;
};

function toSnapshotNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function adminDeleteUserAction(input: {
  targetUserId: unknown;
  reason: unknown;
}): Promise<AdminUsersDeleteState> {
  try {
    const context = await requireAdminUsersMutateAccess();
    if (!canDeleteAdminUsers(context.profile.role, context.permissions)) {
      return {
        success: false,
        error: polishAdminUsersDeleteError("ADMIN_FORBIDDEN"),
        code: "ADMIN_FORBIDDEN",
      };
    }

    const target = parseAdminDeleteTargetUserId(input.targetUserId);
    if (!target.ok) {
      return {
        success: false,
        error: polishAdminUsersDeleteError(target.code),
        code: target.code,
      };
    }

    const reason = parseAdminDeleteReason(input.reason);
    if (!reason.ok) {
      return {
        success: false,
        error: polishAdminUsersDeleteError(reason.code),
        code: reason.code,
      };
    }

    const admin = createSupabaseAdminClient();
    const { data: asserted, error: assertError } = await admin.rpc(
      "admin_assert_user_deletable",
      {
        p_actor_id: context.userId,
        p_target_id: target.value,
      },
    );

    if (assertError) {
      const code = parseAdminUsersDeleteErrorCode(assertError.message);
      return {
        success: false,
        error: polishAdminUsersDeleteError(code),
        code,
      };
    }

    const snapshot = (asserted ?? {}) as DeletableAssert;
    const targetUserNumber = toSnapshotNumber(snapshot.targetUserNumber);
    const actorUserNumber = toSnapshotNumber(snapshot.actorUserNumber);
    const targetRole = snapshot.targetRole ?? "USER";
    const premiumActive = Boolean(snapshot.premiumActive);

    const { data: authUser, error: authLookupError } =
      await admin.auth.admin.getUserById(target.value);
    const targetEmail =
      !authLookupError && authUser.user?.email
        ? authUser.user.email
        : null;

    const deleted = await executeAccountProfile01Deletion(target.value);
    if (!deleted.ok) {
      return {
        success: false,
        error: polishAdminUsersDeleteError("DELETE_FAILED"),
        code: "DELETE_FAILED",
      };
    }

    const { error: auditError } = await admin.from("admin_audit_events").insert({
      actor_user_id: context.userId,
      target_user_id: null,
      actor_user_number: actorUserNumber,
      target_user_number: targetUserNumber,
      action: "USER_ACCOUNT_DELETE",
      old_value: { role: targetRole, premiumActive },
      new_value: { deleted: true },
      metadata: { panel: "admin_users", reason: reason.value },
    });

    let followUp: AdminUsersDeleteCode | null = auditError
      ? "AUDIT_FAILED"
      : null;

    if (targetEmail) {
      const mailed = await sendAdminAccountDeletionEmail({
        to: targetEmail,
        reason: reason.value,
      });
      if (!mailed.ok && followUp !== "AUDIT_FAILED") {
        followUp = "EMAIL_NOTIFICATION_FAILED";
      }
    } else if (followUp !== "AUDIT_FAILED") {
      followUp = "EMAIL_NOTIFICATION_FAILED";
    }

    revalidatePath("/admin/users");

    if (followUp) {
      return {
        success: true,
        error: polishAdminUsersDeleteError(followUp),
        code: followUp,
      };
    }

    return { success: true, error: null, code: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        success: false,
        error: polishAdminUsersDeleteError("ADMIN_FORBIDDEN"),
        code: "ADMIN_FORBIDDEN",
      };
    }
    return {
      success: false,
      error: polishAdminUsersDeleteError("DELETE_FAILED"),
      code: "DELETE_FAILED",
    };
  }
}

export async function applyAdminUserManagementAction(input: {
  targetUserId: unknown;
  role: unknown;
  premiumTier: unknown;
  expiresOn: unknown;
}): Promise<AdminUsersMutationState> {
  try {
    const context = await requireAdminUsersMutateAccess();
    const parsed = parseAdminUsersMutationInput(input);
    if (!parsed.ok) {
      return {
        success: false,
        error: polishAdminUsersMutationError(parsed.code),
        code: parsed.code,
      };
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("admin_apply_user_management", {
      p_actor_id: context.userId,
      p_target_id: parsed.value.targetUserId,
      p_new_role: parsed.value.role,
      p_set_premium: true,
      p_premium_tier: parsed.value.premiumTier,
      p_expires_at: parsed.value.expiresAt,
    });

    if (error) {
      const code = parseAdminUsersMutationErrorCode(error.message);
      return {
        success: false,
        error: polishAdminUsersMutationError(code),
        code,
      };
    }

    revalidatePath("/admin/users");
    return { success: true, error: null, code: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        success: false,
        error: polishAdminUsersMutationError("ADMIN_FORBIDDEN"),
        code: "ADMIN_FORBIDDEN",
      };
    }
    return {
      success: false,
      error: polishAdminUsersMutationError("MUTATION_FAILED"),
      code: "MUTATION_FAILED",
    };
  }
}
