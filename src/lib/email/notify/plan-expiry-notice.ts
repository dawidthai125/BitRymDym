import "server-only";

import { notifyEnv } from "@/lib/email/notify/config";
import {
  formatPlanExpiryDate,
  planExpiryWindow,
  planPlanExpiryMails,
  PLAN_EXPIRY_CANDIDATE_CAP,
  type PlanExpiryCandidate,
} from "@/lib/email/notify/plan-expiry-plan";
import { sendNotification, type NotifyResult } from "@/lib/email/notify/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PlanExpiryNoticeResult = { candidates: number; mails: number; results: Partial<Record<NotifyResult, number>> };

/**
 * Daily cron (runs inside /api/cron/takes-expiry-notice): mail owners of paid, purchased plans
 * that end in 2–3 days and have no queued plan. Claims premium_entitlements.plan_expiry_notified_for
 * (= the warned expires_at) before sending, so a retry never double-mails.
 * Notifications off → nothing is claimed.
 */
export async function runPlanExpiryNotices(now = Date.now()): Promise<PlanExpiryNoticeResult> {
  const empty: PlanExpiryNoticeResult = { candidates: 0, mails: 0, results: {} };
  if (!notifyEnv(process.env).enabled) return { ...empty, results: { disabled: 1 } };
  const admin = createSupabaseAdminClient();
  const win = planExpiryWindow(now);
  const { data, error } = await admin
    .from("premium_entitlements")
    .select("id, user_id, tier, source, active, expires_at, pending_tier, plan_expiry_notified_for")
    .eq("active", true)
    .eq("source", "purchase")
    .neq("tier", "FREE")
    .is("pending_tier", null)
    .gt("expires_at", win.from)
    .lte("expires_at", win.to)
    .order("expires_at", { ascending: true })
    .limit(PLAN_EXPIRY_CANDIDATE_CAP);
  if (error) throw new Error(error.message);
  const candidates: PlanExpiryCandidate[] = (data ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    tier: String(r.tier),
    source: String(r.source),
    active: r.active === true,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    pendingTier: r.pending_tier ? String(r.pending_tier) : null,
    notifiedFor: r.plan_expiry_notified_for ? String(r.plan_expiry_notified_for) : null,
  }));
  if (candidates.length === 0) return empty;

  const plan = planPlanExpiryMails(candidates, now);
  const results: Partial<Record<NotifyResult, number>> = {};
  for (const mail of plan) {
    // Atomic claim: only if this expires_at was not warned yet and the plan is unchanged.
    const { data: claimed } = await admin
      .from("premium_entitlements")
      .update({ plan_expiry_notified_for: mail.expiresAt })
      .eq("id", mail.entitlementId)
      .eq("active", true)
      .eq("expires_at", mail.expiresAt)
      .is("pending_tier", null)
      .or(`plan_expiry_notified_for.is.null,plan_expiry_notified_for.neq."${mail.expiresAt}"`)
      .select("id");
    if (!claimed?.length) {
      results.duplicate = (results.duplicate ?? 0) + 1;
      continue;
    }
    // Templates are Polish-only (no per-user mail locale), so the date is pl-PL too.
    const r = await sendNotification({ userId: mail.userId, kind: "plan_expiring", data: { detail: formatPlanExpiryDate(mail.expiresAt, "pl") } });
    results[r] = (results[r] ?? 0) + 1;
  }
  return { candidates: candidates.length, mails: plan.length, results };
}
