import { NextResponse } from "next/server";

import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadPlanUsage } from "@/lib/plans/plan-usage";

export const runtime = "nodejs";

/**
 * GET /api/account/plan-usage — plan badge + limits for the header.
 * Limits from plan-policy, usage from head-only counts. Private 30 s cache.
 */
export async function GET() {
  const context = await getCurrentProfile();
  if (!context) {
    return NextResponse.json(
      { error: "Zaloguj się.", code: "LOGIN_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const product = await resolveProductEntitlementForAuthContext(context);
    const usage = await loadPlanUsage({
      userId: context.userId,
      tier: product.premiumTier,
    });
    return NextResponse.json(
      { success: true, usage },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Nie udało się wczytać limitów." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
