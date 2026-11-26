import { NextResponse } from "next/server";

import { takeApiErrorResponse } from "@/lib/takes/api-error";
import { createStemUploadSession } from "@/lib/takes/take-transport";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST { contentType, byteSize } (?masterOnly=1: "Sam mastering", a project without a beat; ?rights=1: the user
 * ticked the rights statement — required, owner decision 2026-11-26) — Silver/Gold stem upload session for an owned project.
 * Upload to the signed URL, then POST /api/takes/finalize { takeId }, then place the READY take
 * on a new track (POST .../record/place). The client never sends storage keys or owner ids.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as { contentType?: unknown; byteSize?: unknown } | null;
    if (!body || typeof body.contentType !== "string" || typeof body.byteSize !== "number" || !Number.isInteger(body.byteSize)) {
      return NextResponse.json({ error: "contentType and integer byteSize are required." }, { status: 400 });
    }
    const params = new URL(request.url).searchParams;
    if (params.get("rights") !== "1") {
      return NextResponse.json(
        { error: "Zaznacz, że masz prawa do wgrywanych plików.", code: "RIGHTS_REQUIRED" },
        { status: 400 },
      );
    }
    const session = await createStemUploadSession({ projectId, contentType: body.contentType, byteSize: body.byteSize, masterOnly: params.get("masterOnly") === "1" });
    return NextResponse.json({ success: true, ...session });
  } catch (error) {
    return takeApiErrorResponse(error);
  }
}
