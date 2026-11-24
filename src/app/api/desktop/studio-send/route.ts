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
 * DELETE gives the send back when the upload failed and nothing is left to resume
 * (Owner 2026-11-19). Only the owner's own send, and only within REFUND_WINDOW_MS.
 */
const REFUND_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Shorter than the 24 h in which record/place still accepts a send. */
const REUSE_WINDOW_MS = 20 * 60 * 60 * 1000;
/** Younger than this it may belong to an upload that runs right now. */
const REUSE_AFTER_MS = 2 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handle(peek: boolean) {
  const context = await getCurrentProfile();
  if (!context) {
    return NextResponse.json({ error: "Zaloguj się.", code: "LOGIN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }
  try {
    const product = await resolveProductEntitlementForAuthContext(context);
    const limit = PLAN_POLICY[product.premiumTier].recording.sessionsPerDay;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("claim_desktop_studio_send", {
      p_owner_id: context.userId,
      p_max_per_utc_day: limit,
      p_peek: peek,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as SendRow | null;
    if (!row) throw new Error("no_row");
    if (!row.allowed) {
      // Limit reached, but a claimed send was never used (lost answer, dead network, closed program):
      // that one is the send to use. It binds to a single project, so this gives nothing extra.
      const { data: held, error: heldError } = await admin
        .from("desktop_studio_sends")
        .select("id")
        .eq("owner_id", context.userId)
        .is("project_id", null)
        .gte("created_at", new Date(Date.now() - REUSE_WINDOW_MS).toISOString())
        .lte("created_at", new Date(Date.now() - REUSE_AFTER_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (heldError) throw new Error(heldError.message);
      const id = (held?.[0]?.id as string | undefined) ?? null;
      if (id) {
        row.allowed = true;
        row.send_id = peek ? null : id;
      }
    }
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

export async function DELETE(request: Request) {
  const context = await getCurrentProfile();
  if (!context) {
    return NextResponse.json({ error: "Zaloguj się.", code: "LOGIN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { sendId?: unknown } | null;
  const sendId = typeof body?.sendId === "string" ? body.sendId : "";
  if (!UUID.test(sendId)) {
    return NextResponse.json({ error: "Nieprawidłowy identyfikator wysyłki." }, { status: 400, headers: NO_STORE });
  }
  try {
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - REFUND_WINDOW_MS).toISOString();
    const { data, error } = await admin
      .from("desktop_studio_sends")
      .delete()
      .eq("id", sendId)
      .eq("owner_id", context.userId)
      .gte("created_at", since)
      // 2026-11-22: a send already used for a project (record/place) is not refundable.
      .is("used_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, refunded: (data ?? []).length > 0 }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Nie udało się zwrócić wysyłki." }, { status: 500, headers: NO_STORE });
  }
}
