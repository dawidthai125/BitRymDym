import { NextResponse } from "next/server";

import { loadQueueHealth } from "@/lib/audio/queue-health-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, read-only: counts of waiting / stuck export and master jobs (no ids, no users).
 * 200 = healthy, 503 = a job is stuck (Contabo worker likely down). Watched by
 * .github/workflows/queue-health.yml.
 */
export async function GET() {
  try {
    const health = await loadQueueHealth();
    return NextResponse.json(health, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
