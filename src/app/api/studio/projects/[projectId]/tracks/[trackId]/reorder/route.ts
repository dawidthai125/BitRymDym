import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { reorderStudioTrack } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/** POST — move track up/down. Body: { direction: "up" | "down" } */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as { direction?: string };
    if (body.direction !== "up" && body.direction !== "down") {
      return NextResponse.json(
        { error: "direction must be up or down." },
        { status: 400 },
      );
    }
    const tracks = await reorderStudioTrack({
      projectId,
      trackId,
      direction: body.direction,
    });
    return NextResponse.json({ success: true, tracks });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
