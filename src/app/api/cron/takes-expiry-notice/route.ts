import { NextResponse } from "next/server";

import { cronAuthFailure } from "@/lib/cron/cron-auth";
import { runPlanExpiryNotices, type PlanExpiryNoticeResult } from "@/lib/email/notify/plan-expiry-notice";
import { runTakeExpiryNotices } from "@/lib/email/notify/take-expiry-notice";

export const runtime = "nodejs";

/**
 * Daily (Vercel Cron): e-mail owners whose recordings used in Studio expire within 36 h,
 * then (independently) owners whose paid plan ends in 2–3 days. One cron keeps Hobby limits.
 */
export async function GET(request: Request) {
  const denied = cronAuthFailure(request);
  if (denied) return denied;
  // Plan notices run even when take notices fail; their error never hides the take result.
  const runPlans = async (): Promise<PlanExpiryNoticeResult | { error: string }> => {
    try {
      return await runPlanExpiryNotices();
    } catch (error) {
      console.error("[cron] plan-expiry-notice", error instanceof Error ? error.message : error);
      return { error: "Plan expiry notice failed." };
    }
  };
  try {
    const takes = await runTakeExpiryNotices();
    return NextResponse.json({ success: true, ...takes, plans: await runPlans() });
  } catch (error) {
    console.error("[cron] takes-expiry-notice", error instanceof Error ? error.message : error);
    const plans = await runPlans();
    return NextResponse.json({ error: "Take expiry notice failed.", plans }, { status: 500 });
  }
}
