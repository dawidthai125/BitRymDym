import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { applyStudioTrackMidi } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/**
 * PUT { expectedDocumentVersion, midi } — replace a track's MIDI notes (CAS on the document version).
 * Null or notes:[] clears the column.
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json().catch(() => null)) as { expectedDocumentVersion?: unknown; midi?: unknown } | null;
    if (!body || !("midi" in body)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const result = await applyStudioTrackMidi({
      projectId,
      trackId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      midi: body.midi,
    });
    return NextResponse.json({ success: true, midi: result.midi, documentVersion: result.documentVersion });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
