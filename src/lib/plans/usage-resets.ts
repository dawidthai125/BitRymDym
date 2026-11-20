import "server-only";

import {
  USAGE_RESET_METRICS,
  windowStartAfterReset,
  type UsageResetMetric,
} from "@/lib/plans/usage-resets-model";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Missing table (migration not applied yet) = no resets, never an error for the user. */
function missing(e: { code?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42501");
}

/** All reset markers of one user, keyed by metric. */
export async function loadUsageResets(
  userId: string,
  admin: Admin = createSupabaseAdminClient(),
): Promise<Partial<Record<UsageResetMetric, string>>> {
  const { data, error } = await admin.from("usage_resets").select("metric, reset_at").eq("user_id", userId);
  if (error) {
    if (missing(error)) return {};
    throw new Error(error.message);
  }
  const out: Partial<Record<UsageResetMetric, string>> = {};
  for (const row of (data ?? []) as { metric: string; reset_at: string }[]) {
    if ((USAGE_RESET_METRICS as readonly string[]).includes(row.metric)) {
      out[row.metric as UsageResetMetric] = row.reset_at;
    }
  }
  return out;
}

/** Window start for one counter, moved forward by an admin reset when there is one. */
export async function usageWindowStart(
  userId: string,
  metric: UsageResetMetric,
  defaultStartIso: string,
  admin: Admin = createSupabaseAdminClient(),
): Promise<string> {
  const { data, error } = await admin
    .from("usage_resets")
    .select("reset_at")
    .eq("user_id", userId)
    .eq("metric", metric)
    .maybeSingle();
  if (error) {
    if (missing(error)) return defaultStartIso;
    throw new Error(error.message);
  }
  return windowStartAfterReset(defaultStartIso, (data as { reset_at?: string } | null)?.reset_at ?? null);
}
