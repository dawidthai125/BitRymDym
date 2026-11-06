import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { applyStudioTrackAutomation } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/**
 * PUT { expectedDocumentVersion, automation } — Silver/Gold: replace a track's gain/pan automation
 * (CAS on the document version). An empty lane list clears it. Below Silver → 403.
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json().catch(() => null)) as { expectedDocumentVersion?: unknown; automation?: unknown } | null;
    if (!body || !("automation" in body)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const result = await applyStudioTrackAutomation({
      projectId,
      trackId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      automation: body.automation,
    });
    return NextResponse.json({ success: true, automation: result.automation, documentVersion: result.documentVersion });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
