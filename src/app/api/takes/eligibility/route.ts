import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { withTakeCredits } from "@/lib/studio/quota-credits";
import { studioQuotaRemaining } from "@/lib/studio/quota-credits-read";
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
    let withPack = decision;
    try {
      const profile = await getCurrentProfile();
      if (profile) {
        withPack = withTakeCredits(decision, await studioQuotaRemaining(profile.userId, "take"));
      }
    } catch {
      withPack = decision;
    }
    return NextResponse.json({
      success: true,
      allowed: withPack.allowed,
      code: withPack.code,
      message: withPack.message,
      maxRecordingSeconds: withPack.maxRecordingSeconds,
      actor: withPack.actor,
      premiumTier: withPack.premiumTier,
      dailySessionsUsed: withPack.dailySessionsUsed,
      dailySessionLimit: withPack.dailySessionLimit,
      activeReadyUsed: withPack.activeReadyUsed,
      activeReadyCap: withPack.activeReadyCap,
      upgradeHintTier: withPack.upgradeHintTier,
      upgradeHintMessage: withPack.upgradeHintMessage,
    });
  } catch (error) {
    return takeApiErrorResponse(error);
  }
}
