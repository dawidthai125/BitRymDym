import { NextResponse } from "next/server";

import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import { runSampekAi, isSampekAiAction } from "@/lib/studio/play/sampek-ai";
import { parsePlaySession } from "@/lib/studio/play/sampek-edit";

export const runtime = "nodejs";

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
    const result = await runSampekAi(session, body.action);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ message: "Zaloguj się, aby użyć Sampeka." }, { status: 401 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Sampek nie odpowiedział." }, { status: 502 });
  }
}
