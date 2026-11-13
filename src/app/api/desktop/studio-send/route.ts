import { NextResponse } from "next/server";

import { PLAN_POLICY } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

type SendRow = { allowed: boolean; send_id: string | null; used: number; day_limit: number };

/**
 * Windows recorder: daily "Wrzuć do Studia" sends (Owner 2026-11-13), separate from the
 * site count of finished songs. Same plan number per UTC day (recording.sessionsPerDay).
 * GET only reads the counter; POST spends one send before the recorder uploads anything.
 */
async function handle(peek: boolean) {
  const context = await getCurrentProfile();
  if (!context) {
    return NextResponse.json({ error: "Zaloguj się.", code: "LOGIN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }
  try {
    const product = await resolveProductEntitlementForAuthContext(context);
    const limit = PLAN_POLICY[product.premiumTier].recording.sessionsPerDay;
    const { data, error } = await createSupabaseAdminClient().rpc("claim_desktop_studio_send", {
      p_owner_id: context.userId,
      p_max_per_utc_day: limit,
      p_peek: peek,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as SendRow | null;
    if (!row) throw new Error("no_row");
    const body = { allowed: row.allowed, sendId: row.send_id, used: row.used, limit: row.day_limit, tier: product.premiumTier };
    if (!peek && !row.allowed) {
      return NextResponse.json({ ...body, error: "desktop_send_limit" }, { status: 429, headers: NO_STORE });
    }
    return NextResponse.json({ success: true, ...body }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Nie udało się sprawdzić limitu wysyłek." }, { status: 500, headers: NO_STORE });
  }
}

export async function GET() {
  return handle(true);
}

export async function POST() {
  return handle(false);
}
