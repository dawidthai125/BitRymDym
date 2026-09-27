import { NextResponse } from "next/server";

import { runTakesRetentionJanitor } from "@/lib/takes/takes-janitor";

export const runtime = "nodejs";

/**
 * Recording Wave 4 — retention janitor (Vercel Cron / manual).
 * Authorization: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
