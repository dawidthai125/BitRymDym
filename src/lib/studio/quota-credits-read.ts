import "server-only";

import type { PlanPack } from "@/config/plan-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Remaining one-off credits. A missing table (migration not applied) counts as zero. */
export async function studioQuotaRemaining(userId: string, kind: PlanPack): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_quota_credits")
    .select("remaining")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  if (error || !data) return 0;
  const remaining = Number((data as { remaining?: unknown }).remaining);
  if (!Number.isSafeInteger(remaining) || remaining <= 0) return 0;
  return remaining;
}
