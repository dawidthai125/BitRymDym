"use server";

import { revalidatePath } from "next/cache";

import { canMutateAdminUsers } from "@/lib/admin/users-authz";
import { parseAdminUsersMutationInput } from "@/lib/admin/users-mutate";
import {
  polishAdminUsersMutationError,
  parseAdminUsersMutationErrorCode,
  type AdminUsersMutationCode,
} from "@/lib/admin/users-mutate-errors";
import { AuthError, requirePermission, requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
