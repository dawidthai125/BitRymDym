import { NextResponse } from "next/server";

import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { runSampekAi, isSampekAiAction } from "@/lib/studio/play/sampek-ai";
import { parsePlaySession } from "@/lib/studio/play/sampek-edit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Durable, atomic cost guard: per-tier hourly cap + single-flight via RPC claim_sampek_usage (table sampek_usage).
// The in-memory set only releases "busy" as soon as a run finishes on the same instance.
const SAMPEK_PER_HOUR = { BRONZE: 10, SILVER: 30, GOLD: 60, STAFF: 120 } as const;
const SAMPEK_BUSY_SECONDS = 5;
const sampekBusy = new Set<string>();

function sampekPerHour(tier: string, role: string | null | undefined): number {
  if (role === "ADMIN" || role === "MODERATOR") return SAMPEK_PER_HOUR.STAFF;
  if (tier === "GOLD") return SAMPEK_PER_HOUR.GOLD;
  if (tier === "SILVER") return SAMPEK_PER_HOUR.SILVER;
  return SAMPEK_PER_HOUR.BRONZE;
}

/** 'ok' | 'rate_limit' | 'busy' | 'unavailable' (RPC error → fail closed). */
async function claimSampek(userId: string, perHour: number): Promise<"ok" | "rate_limit" | "busy" | "unavailable"> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("claim_sampek_usage", {
      p_owner: userId,
      p_per_hour: perHour,
      p_busy_seconds: SAMPEK_BUSY_SECONDS,
    });
    if (error) return "unavailable";
    return data === "ok" || data === "rate_limit" || data === "busy" ? data : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
    if (!["BRONZE", "SILVER", "GOLD"].includes(tier) && auth.profile.role !== "ADMIN" && auth.profile.role !== "MODERATOR") {
      return NextResponse.json({ message: "Sampek AI jest dostępny od planu Bronze." }, { status: 403 });
    }
    const body = (await request.json()) as { session?: unknown; action?: unknown };
    const session = parsePlaySession(body.session);
    if (!session || !isSampekAiAction(body.action)) return NextResponse.json({ message: "Nieprawidłowa sesja lub operacja." }, { status: 400 });
    const userId = auth.profile.id;
    if (sampekBusy.has(userId)) return NextResponse.json({ message: "Sampek jeszcze pracuje nad poprzednią prośbą." }, { status: 429 });
    const claim = await claimSampek(userId, sampekPerHour(tier, auth.profile.role));
    if (claim === "busy") return NextResponse.json({ message: "Sampek jeszcze pracuje nad poprzednią prośbą." }, { status: 429 });
    if (claim === "rate_limit") return NextResponse.json({ message: "Limit użyć Sampeka na godzinę został wykorzystany. Spróbuj później." }, { status: 429 });
    if (claim === "unavailable") return NextResponse.json({ message: "Sampek jest chwilowo niedostępny. Spróbuj za kilka minut." }, { status: 503 });
    sampekBusy.add(userId);
    try {
      const result = await runSampekAi(session, body.action);
      return NextResponse.json({ result });
    } finally {
      sampekBusy.delete(userId);
    }
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ message: "Zaloguj się, aby użyć Sampeka." }, { status: 401 });
    console.error("[sampek] provider error", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ message: "Sampek nie odpowiedział. Spróbuj ponownie." }, { status: 502 });
  }
}
