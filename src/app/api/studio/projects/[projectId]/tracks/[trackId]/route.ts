import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  deleteStudioTrack,
  updateStudioTrackControls,
} from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/** PATCH — update track controls (name, mute, solo, vol, pan, arm) with CAS. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
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
      expectedDocumentVersion: body.expectedDocumentVersion,
      name: body.name,
      muted: body.muted,
      solo: body.solo,
      gainDb: body.gainDb,
      pan: body.pan,
      recordArmed: body.recordArmed,
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

/** DELETE — remove user track (not BEAT). Cascades clips; Takes preserved. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
    };
    const result = await deleteStudioTrack({
      projectId,
      trackId,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      deletedTrackId: result.deletedTrackId,
      documentVersion: result.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
