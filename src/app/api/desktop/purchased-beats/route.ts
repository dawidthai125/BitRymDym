import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { listPurchasedCatalog } from "@/lib/beats/purchased-catalog";
import type { DesktopBeatChoice } from "@/lib/recorder/desktop-bootstrap";

export const runtime = "nodejs";

/**
 * Windows recorder (owner order 2026-11-26): the signed-in user's bought exclusive beats.
 * A sold paid beat leaves the public catalogue (and the bootstrap list), so the program asks
 * here with its Bearer token. Playback and the Studio project already accept the buyer.
 */
export async function GET() {
  const session = await getCurrentProfile();
  if (!session) {
    return NextResponse.json({ error: "Najpierw się zaloguj.", code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const rows = await listPurchasedCatalog(session.userId);
    const beats: DesktopBeatChoice[] = rows.map((beat) => ({
      id: beat.id,
      title: beat.title,
      bpm: beat.bpm,
      durationSeconds: beat.durationSeconds,
    }));
    return NextResponse.json({ success: true, beats }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Nie udało się wczytać kupionych bitów.", code: "INTERNAL" }, { status: 500 });
  }
}
