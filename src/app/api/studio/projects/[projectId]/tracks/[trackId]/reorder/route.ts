import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { reorderStudioTrack } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/** POST — move track up/down with CAS. Body: { direction, expectedDocumentVersion } */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as {
      direction?: string;
      expectedDocumentVersion?: unknown;
    };
    if (body.direction !== "up" && body.direction !== "down") {
      return NextResponse.json(
        { error: "direction must be up or down." },
        { status: 400 },
      );
    }
    const result = await reorderStudioTrack({
      projectId,
      trackId,
      direction: body.direction,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      tracks: result.tracks,
      documentVersion: result.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
