import "server-only";

import { notifyEnv } from "@/lib/email/notify/config";
import {
  noRecordingWindow,
  planNoRecordingMails,
  NO_RECORDING_CANDIDATE_CAP,
  type NoRecordingCandidate,
} from "@/lib/email/notify/no-recording-plan";
import { sendNotification, type NotifyResult } from "@/lib/email/notify/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type NoRecordingNoticeResult = { candidates: number; mails: number; results: Partial<Record<NotifyResult, number>> };

/**
 * Daily cron (runs inside /api/cron/takes-expiry-notice): one-time "nic jeszcze nie nagrałeś"
 * mail for 3–10-day-old accounts with no recording and no Studio project (max 50 per run).
 * Claims notification_preferences.no_recording_nudge_sent_at before sending (like welcome_sent_at),
 * so a retry never double-mails. sendNotification re-checks preferences and the confirmed e-mail.
 * Notifications off → nothing is claimed.
 */
export async function runNoRecordingNotices(now = Date.now()): Promise<NoRecordingNoticeResult> {
  const empty: NoRecordingNoticeResult = { candidates: 0, mails: 0, results: {} };
  if (!notifyEnv(process.env).enabled) return { ...empty, results: { disabled: 1 } };
  const admin = createSupabaseAdminClient();
  const win = noRecordingWindow(now);
  const { data, error } = await admin.rpc("list_no_recording_nudge_candidates", {
    p_created_after: win.createdAfter,
    p_created_before: win.createdBefore,
    p_limit: NO_RECORDING_CANDIDATE_CAP,
  });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const candidates: NoRecordingCandidate[] = rows.map((r) => ({
    userId: String(r.user_id),
    createdAt: String(r.created_at),
    emailConfirmed: r.email_confirmed === true,
    role: String(r.role ?? "USER"),
    hasTake: r.has_take === true,
    hasProject: r.has_project === true,
    studioMailOn: r.studio_mail_on !== false,
    nudgeSentAt: r.nudge_sent_at ? String(r.nudge_sent_at) : null,
  }));
  if (candidates.length === 0) return empty;

  const plan = planNoRecordingMails(candidates, now);
  const results: Partial<Record<NotifyResult, number>> = {};
  for (const userId of plan) {
    // Same one-shot claim as sendWelcomeOnce: make sure the row exists, then flip null → now.
    await admin.from("notification_preferences").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data: claimed } = await admin
      .from("notification_preferences")
      .update({ no_recording_nudge_sent_at: new Date(now).toISOString() })
      .eq("user_id", userId)
      .is("no_recording_nudge_sent_at", null)
      .select("user_id");
    if (!claimed?.length) {
      results.duplicate = (results.duplicate ?? 0) + 1;
      continue;
    }
    const r = await sendNotification({ userId, kind: "no_recording_yet" });
    results[r] = (results[r] ?? 0) + 1;
  }
  return { candidates: candidates.length, mails: plan.length, results };
}
