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
  login: 401, not_approved: 409, tier_format: 403, tier_project: 403, bad_request: 400, weekly_limit: 429, input_missing: 409,
};
