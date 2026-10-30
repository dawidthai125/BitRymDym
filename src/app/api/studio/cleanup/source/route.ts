import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { cleanedSourceUrl } from "@/lib/studio/cleanup/cleanup-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

/**
 * GET ?takeId=&jobId= — short-lived signed URL of the cleaned take (owner only).
 * Without jobId: the take's applied cleanup, or `{ url: null }` → play the original.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    const q = new URL(request.url).searchParams;
    const r = await cleanedSourceUrl({ ownerId: auth.userId, takeId: q.get("takeId") ?? "", jobId: q.get("jobId") });
    return NextResponse.json({ success: true, jobId: r?.jobId ?? null, url: r?.url ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
