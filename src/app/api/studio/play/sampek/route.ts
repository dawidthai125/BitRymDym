import { NextResponse } from "next/server";

import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { runSampekAi, isSampekAiAction } from "@/lib/studio/play/sampek-ai";
import { parsePlaySession } from "@/lib/studio/play/sampek-edit";

export const runtime = "nodejs";

// Per-instance guard against cost abuse: one run at a time and a short per-user budget.
// (A durable per-plan quota needs a DB migration — see the security review.)
const SAMPEK_WINDOW_MS = 60 * 60 * 1000;
const SAMPEK_MAX_PER_WINDOW = 20;
const sampekHits = new Map<string, number[]>();
const sampekBusy = new Set<string>();

function sampekAllowed(userId: string): boolean {
  const now = Date.now();
  const hits = (sampekHits.get(userId) ?? []).filter((t) => now - t < SAMPEK_WINDOW_MS);
  if (hits.length >= SAMPEK_MAX_PER_WINDOW) {
    sampekHits.set(userId, hits);
    return false;
  }
  hits.push(now);
  sampekHits.set(userId, hits);
  if (sampekHits.size > 5000) sampekHits.clear();
  return true;
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
    if (!sampekAllowed(userId)) return NextResponse.json({ message: "Limit użyć Sampeka na godzinę został wykorzystany. Spróbuj później." }, { status: 429 });
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
