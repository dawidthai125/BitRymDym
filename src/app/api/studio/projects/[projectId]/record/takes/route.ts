import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { listReadyTakesForStudioPlace } from "@/lib/studio/studio-record-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * GET — owned READY Takes for Studio place-from-library (P5.6).
 * Project ownership enforced in service. No storage keys exposed.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const result = await listReadyTakesForStudioPlace(projectId);
    return NextResponse.json({
      success: true,
      beatId: result.beatId,
      takes: result.takes,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
