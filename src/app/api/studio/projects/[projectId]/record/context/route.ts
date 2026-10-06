import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { resolveStudioRecordingBeatId } from "@/lib/studio/studio-record-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * GET — resolve beat + timeline context for Studio recording (auth + ownership).
 * Client then uses existing /api/takes/eligibility + /api/takes/session.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const resolved = await resolveStudioRecordingBeatId(projectId);
    return NextResponse.json({ success: true, ...resolved });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
