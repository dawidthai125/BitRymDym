import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { splitStudioClip } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; clipId: string }>;
};

/**
 * POST — SPLIT Clip at absolute timeline position (integer ms).
 * Creates a second Clip sharing the same source reference.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, clipId } = await context.params;
    const body = (await request.json()) as { atTimelineMs?: number };
    if (typeof body.atTimelineMs !== "number") {
      return NextResponse.json(
        { error: "atTimelineMs jest wymagane." },
        { status: 400 },
      );
    }
    const result = await splitStudioClip({
      projectId,
      clipId,
      atTimelineMs: body.atTimelineMs,
    });
    return NextResponse.json(
      { success: true, left: result.left, right: result.right },
      { status: 201 },
    );
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
