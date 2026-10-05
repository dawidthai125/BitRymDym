import { NextResponse } from "next/server";

import { resolveRecordingEligibility } from "@/lib/takes/recording-eligibility-service";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * P4.1 — pre-mic eligibility probe.
 * POST JSON { beatId }
 * Never trusts client tier / caps.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { beatId?: string };
    if (typeof body.beatId !== "string" || !body.beatId) {
      return NextResponse.json({ error: "beatId is required." }, { status: 400 });
    }

    const decision = await resolveRecordingEligibility({ beatId: body.beatId });
    return NextResponse.json({
      success: true,
      allowed: decision.allowed,
      code: decision.code,
      message: decision.message,
      maxRecordingSeconds: decision.maxRecordingSeconds,
      actor: decision.actor,
      premiumTier: decision.premiumTier,
      dailySessionsUsed: decision.dailySessionsUsed,
      dailySessionLimit: decision.dailySessionLimit,
      activeReadyUsed: decision.activeReadyUsed,
      activeReadyCap: decision.activeReadyCap,
      upgradeHintTier: decision.upgradeHintTier,
      upgradeHintMessage: decision.upgradeHintMessage,
    });
  } catch (error) {
    return takeApiErrorResponse(error);
  }
}
