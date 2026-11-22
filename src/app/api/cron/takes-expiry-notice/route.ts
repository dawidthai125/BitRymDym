import { NextResponse } from "next/server";

import { cronAuthFailure } from "@/lib/cron/cron-auth";
import { runNoRecordingNotices } from "@/lib/email/notify/no-recording-notice";
import { runPlanExpiryNotices } from "@/lib/email/notify/plan-expiry-notice";
import { runTakeExpiryNotices } from "@/lib/email/notify/take-expiry-notice";
import { runReferralRewardSweep } from "@/lib/referrals/referral-service";
import { runOwnerWeeklyReport } from "@/lib/reports/owner-weekly-report-run";

export const runtime = "nodejs";

/** Runs one step; its error is logged and returned, never thrown (one step must not hide another). */
async function step<T>(name: string, message: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    console.error(`[cron] ${name}`, error instanceof Error ? error.message : error);
    return { error: message };
  }
}

/**
 * Daily (Vercel Cron): e-mail owners whose recordings used in Studio expire within 36 h,
 * then (independently) owners whose paid plan ends in 2–3 days, new accounts that have not
 * recorded anything yet (one-time nudge), on Mondays the weekly owner report, and pending
 * referral rewards ("Zaproś znajomego") that became due.
 * One cron keeps Hobby limits.
 */
export async function GET(request: Request) {
  const denied = cronAuthFailure(request);
  if (denied) return denied;
  // The other steps run even when take notices fail; their errors never hide the take result.
  const runOthers = async () => ({
    plans: await step("plan-expiry-notice", "Plan expiry notice failed.", () => runPlanExpiryNotices()),
    noRecording: await step("no-recording-notice", "No-recording notice failed.", () => runNoRecordingNotices()),
    ownerReport: await step("owner-weekly-report", "Owner weekly report failed.", () => runOwnerWeeklyReport()),
    referrals: await step("referral-sweep", "Referral sweep failed.", () => runReferralRewardSweep()),
  });
  try {
    const takes = await runTakeExpiryNotices();
    return NextResponse.json({ success: true, ...takes, ...(await runOthers()) });
  } catch (error) {
    console.error("[cron] takes-expiry-notice", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Take expiry notice failed.", ...(await runOthers()) }, { status: 500 });
  }
}
