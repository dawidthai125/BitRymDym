import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { duplicateStudioTrack } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/** POST — duplicate user track + clips (atomic capacity + CAS). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
    };
    const result = await duplicateStudioTrack({
      projectId,
      trackId,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      track: result.track,
      clips: result.clips,
      documentVersion: result.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
