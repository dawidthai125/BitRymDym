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
import {
  parseAdminAddonErrorCode,
  parseAdminAddonInput,
  polishAdminAddonError,
  type AdminAddonCode,
} from "@/lib/admin/users-addons";
import { executeAccountProfile01Deletion } from "@/lib/auth/delete-account";
import {
  USAGE_RESET_METRICS,
  isUsageResetMetric,
  type UsageResetMetric,
} from "@/lib/plans/usage-resets-model";
import { AuthError, requirePermission, requireRole } from "@/lib/auth/session";
import { sendAdminAccountDeletionEmail } from "@/lib/email/send-admin-account-deletion-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extendTakeRetentionForTier } from "@/lib/takes/take-retention-upgrade";
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

    // Plan policy: upgrade → live takes get the new plan's validity.
    await extendTakeRetentionForTier(parsed.value.targetUserId, parsed.value.premiumTier);

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

export type AdminAddonState = {
  success: boolean;
  error: string | null;
  code: AdminAddonCode | null;
};

/** Grant (or extend) / revoke a plan add-on. RPC = one transaction incl. audit row. */
export async function setAdminPlanAddonAction(input: {
  targetUserId: unknown;
  addon: unknown;
  grant: unknown;
  endsOn: unknown;
  note: unknown;
}): Promise<AdminAddonState> {
  try {
    const context = await requireAdminUsersMutateAccess();
    const parsed = parseAdminAddonInput(input);
    if (!parsed.ok) {
      return { success: false, error: polishAdminAddonError(parsed.code), code: parsed.code };
    }
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("admin_set_plan_addon", {
      p_actor_id: context.userId,
      p_target_id: parsed.value.targetUserId,
      p_addon: parsed.value.addon,
      p_grant: parsed.value.grant,
      p_ends_at: parsed.value.endsAt,
      p_note: parsed.value.note,
    });
    if (error) {
      const code = parseAdminAddonErrorCode(error.message);
      return { success: false, error: polishAdminAddonError(code), code };
    }
    revalidatePath("/admin/users");
    return { success: true, error: null, code: null };
  } catch (error) {
    const code: AdminAddonCode = error instanceof AuthError ? "ADMIN_FORBIDDEN" : "MUTATION_FAILED";
    return { success: false, error: polishAdminAddonError(code), code };
  }
}

export type AdminUsageResetState = { success: boolean; error: string | null; resetAt: string | null };

/**
 * Admin "reset limits": every counter of the chosen metric(s) starts again from now.
 * History stays intact (usage_resets marker, see migration 20261120090000). Logged as USAGE_RESET.
 */
export async function resetAdminUserUsageAction(input: {
  targetUserId: unknown;
  metric: unknown;
}): Promise<AdminUsageResetState> {
  try {
    const context = await requireAdminUsersMutateAccess();
    const target = parseAdminDeleteTargetUserId(input.targetUserId);
    if (!target.ok) return { success: false, error: "Nieprawidłowy użytkownik.", resetAt: null };
    const metrics: UsageResetMetric[] =
      input.metric === "all" ? [...USAGE_RESET_METRICS] : isUsageResetMetric(input.metric) ? [input.metric] : [];
    if (metrics.length === 0) return { success: false, error: "Nieznany limit.", resetAt: null };

    const admin = createSupabaseAdminClient();
    const resetAt = new Date().toISOString();
    const { data: before } = await admin
      .from("usage_resets")
      .select("metric, reset_at")
      .eq("user_id", target.value)
      .in("metric", metrics);
    const previous = Object.fromEntries(
      metrics.map((m) => [m, (before ?? []).find((row) => row.metric === m)?.reset_at ?? null]),
    );
    const { error } = await admin.from("usage_resets").upsert(
      metrics.map((metric) => ({ user_id: target.value, metric, reset_at: resetAt, reset_by: context.userId })),
      { onConflict: "user_id,metric" },
    );
    if (error) return { success: false, error: "Nie udało się wyzerować limitu. Spróbuj ponownie.", resetAt: null };

    const { data: numbers } = await admin
      .from("profiles")
      .select("id, user_number")
      .in("id", [context.userId, target.value]);
    const numberOf = (id: string) =>
      toSnapshotNumber((numbers ?? []).find((row) => row.id === id)?.user_number as number | null | undefined);
    // old_value is NOT NULL in admin_audit_events: keep the previous reset times there.
    const { error: auditError } = await admin.from("admin_audit_events").insert({
      actor_user_id: context.userId,
      target_user_id: target.value,
      actor_user_number: numberOf(context.userId),
      target_user_number: numberOf(target.value),
      action: "USAGE_RESET",
      old_value: { previous },
      new_value: { metrics, resetAt },
      metadata: { panel: "admin_user_desk" },
    });
    if (auditError) console.error("[admin] usage reset audit failed", auditError.message);

    revalidatePath(`/admin/users/${target.value}`);
    return { success: true, error: null, resetAt };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? "Brak uprawnień do zmiany limitów." : "Nie udało się wyzerować limitu. Spróbuj ponownie.",
      resetAt: null,
    };
  }
}
