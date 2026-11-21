import { NextResponse } from "next/server";

import { cronAuthFailure } from "@/lib/cron/cron-auth";
import { runTakesRetentionJanitor } from "@/lib/takes/takes-janitor";

export const runtime = "nodejs";

/**
 * Recording Wave 4 — retention janitor (Vercel Cron / manual).
 * Authorization: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request: Request) {
  const denied = cronAuthFailure(request);
  if (denied) return denied;

  try {
    const result = await runTakesRetentionJanitor();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Takes janitor failed.",
      },
      { status: 500 },
    );
  }
}
