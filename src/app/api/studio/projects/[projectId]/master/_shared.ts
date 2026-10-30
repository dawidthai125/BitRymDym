import { NextResponse } from "next/server";

import type { requireUser } from "@/lib/auth/session";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { StudioMasterUnavailable } from "@/lib/studio/master/server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import type { PremiumTier } from "@/types/premium";

export async function tierOf(auth: Awaited<ReturnType<typeof requireUser>>): Promise<PremiumTier> {
  return (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function masterErrorResponse(error: unknown) {
  if (error instanceof StudioMasterUnavailable) return NextResponse.json({ success: true, available: false }, { status: 200 });
  return studioApiErrorResponse(error);
}

export const DENY_STATUS: Record<string, number> = {
  login: 401, not_approved: 409, tier_format: 403, tier_project: 403, bad_request: 400, weekly_limit: 429, monthly_limit: 429, input_missing: 409, doc_changed: 409,
  // Reference mastering: plan without it / Silver without the add-on / upload checks.
  reference_locked: 403, addon_missing: 402, reference_invalid: 409, upload_incomplete: 409, not_available: 503,
  bad_format: 415, too_big: 413, too_long: 422, too_short: 422,
  // Gold YouTube MP4.
  tier_video: 403, image_missing: 409, daily_limit: 429, image_rejected: 422,
  // Gold AI cover generator.
  prompt_rejected: 422, prompt_check_down: 503, ai_unavailable: 503, not_own_beat: 403,
};
