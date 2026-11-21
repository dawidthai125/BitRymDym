import { NextResponse } from "next/server";

import { cronAuthFailure } from "@/lib/cron/cron-auth";
import { runTakeExpiryNotices } from "@/lib/email/notify/take-expiry-notice";

export const runtime = "nodejs";

/** Daily (Vercel Cron): e-mail owners whose recordings used in Studio expire within 36 h. */
export async function GET(request: Request) {
  const denied = cronAuthFailure(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ success: true, ...(await runTakeExpiryNotices()) });
  } catch (error) {
    console.error("[cron] takes-expiry-notice", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Take expiry notice failed." }, { status: 500 });
  }
}
