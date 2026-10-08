import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { addStudioTrack } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

/** POST — add VOCAL track (atomic capacity + CAS). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
    };
    const result = await addStudioTrack({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      track: result.track,
      documentVersion: result.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
