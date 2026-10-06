import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { updateStudioTrackControls } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/** PATCH — update track controls (name, mute, solo, vol, pan, arm). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      muted?: boolean;
      solo?: boolean;
      gainDb?: number;
      pan?: number;
      recordArmed?: boolean;
    };
    const result = await updateStudioTrackControls({
      projectId,
      trackId,
      ...body,
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
