import "server-only";

import { Resend } from "resend";

import { notifyEnv } from "@/lib/email/notify/config";
import {
  buildOwnerWeeklyReportMail,
  isWarsawMonday,
  parseReportRecipients,
  parseWeeklyStats,
  weeklyReportPeriods,
  type ReportPeriod,
} from "@/lib/reports/owner-weekly-report";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type OwnerWeeklyReportResult =
  | { status: "not_monday" | "disabled" | "no_recipient" | "duplicate" }
  | { status: "sent" | "failed"; period: string; recipients: number };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** OWNER_REPORT_EMAIL first; otherwise the confirmed e-mails of ADMIN accounts (max 3). */
export async function reportRecipients(admin: Admin): Promise<string[]> {
  const fromEnv = parseReportRecipients(process.env.OWNER_REPORT_EMAIL);
  if (fromEnv.length) return fromEnv;
  const { data, error } = await admin.from("profiles").select("id").eq("role", "ADMIN").order("created_at", { ascending: true }).limit(3);
  if (error) throw new Error(error.message);
  const out: string[] = [];
  for (const p of data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(String(p.id));
    if (u?.user?.email && u.user.email_confirmed_at) out.push(u.user.email);
  }
  return parseReportRecipients(out.join(","));
}

async function loadStats(admin: Admin, p: ReportPeriod) {
  const { data, error } = await admin.rpc("owner_weekly_report_stats", { p_from: p.from, p_to: p.to });
  if (error) throw new Error(error.message);
  return parseWeeklyStats(data);
}

/**
 * Runs every day inside /api/cron/takes-expiry-notice; sends only on Monday (Warsaw).
 * owner_report_runs(kind, period_key) is the claim, so a second run the same Monday is a no-op.
 * A failed send releases the claim, so a manual re-run can retry. Never logs addresses.
 */
export async function runOwnerWeeklyReport(now = Date.now()): Promise<OwnerWeeklyReportResult> {
  if (!isWarsawMonday(now)) return { status: "not_monday" };
  const env = notifyEnv(process.env);
  if (!env.enabled) return { status: "disabled" };
  const admin = createSupabaseAdminClient();
  const to = await reportRecipients(admin);
  if (!to.length) return { status: "no_recipient" };
  const periods = weeklyReportPeriods(now);
  const [cur, prev] = await Promise.all([loadStats(admin, periods.current), loadStats(admin, periods.previous)]);

  const { data: claimed, error: claimErr } = await admin
    .from("owner_report_runs")
    .upsert({ kind: "weekly", period_key: periods.key }, { onConflict: "kind,period_key", ignoreDuplicates: true })
    .select("period_key");
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) return { status: "duplicate" };

  const mail = buildOwnerWeeklyReportMail(periods, cur, prev, getSiteUrl());
  let ok = false;
  try {
    const { error } = await new Resend(env.apiKey).emails.send({
      from: env.from, to, subject: mail.subject, text: mail.text, html: mail.html,
      tags: [{ name: "kind", value: "owner_weekly_report" }],
    });
    ok = !error;
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error("[owner-report] send failed", { period: periods.key });
    await admin.from("owner_report_runs").delete().eq("kind", "weekly").eq("period_key", periods.key);
    return { status: "failed", period: periods.key, recipients: to.length };
  }
  console.info("[owner-report] sent", { period: periods.key });
  return { status: "sent", period: periods.key, recipients: to.length };
}
