import "server-only";

import type { GrantWrite } from "@/lib/payments/entitlement-grant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type ClaimCode = "ok" | "already" | "missing" | "wait" | "conflict" | "off";

/**
 * Claims a prize and writes the finite premium window in one database
 * function. A missing function means the migration is not applied yet.
 */
export async function claimCommunityReward(
  admin: Admin,
  userId: string,
  rewardId: string,
  write: Extract<GrantWrite, { action: "plan" | "schedule" }>,
): Promise<ClaimCode> {
  const applied = await admin.rpc("claim_community_reward", {
    p_reward_id: rewardId,
    p_user_id: userId,
    p_write: write,
  });
  if (applied.error) {
    const message = applied.error.message.toLowerCase();
    if (
      applied.error.code === "PGRST202" ||
      message.includes("claim_community_reward") ||
      message.includes("does not exist") ||
      message.includes("schema cache")
    ) {
      return "off";
    }
    return "conflict";
  }
  const code = typeof applied.data === "string" ? applied.data : "";
  if (code === "ok" || code === "already" || code === "missing" || code === "wait" || code === "conflict") {
    return code;
  }
  return "conflict";
}
