import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { addStudioClip } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** POST — add Clip onto a Track (Take / Beat / Artifact source) with CAS. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      trackId?: string;
      sourceKind?: "TAKE" | "BEAT_REF" | "ARTIFACT";
      sourceTakeId?: string | null;
      sourceBeatId?: string | null;
      sourceArtifactId?: string | null;
      timelineStartMs?: number;
      durationMs?: number;
      sourceOffsetMs?: number;
    };
    if (!body.trackId || !body.sourceKind) {
      return NextResponse.json(
        { error: "trackId and sourceKind are required." },
        { status: 400 },
      );
    }
    if (
      typeof body.timelineStartMs !== "number" ||
      typeof body.durationMs !== "number"
    ) {
      return NextResponse.json(
        { error: "timelineStartMs and durationMs are required integers." },
        { status: 400 },
      );
    }
    const result = await addStudioClip({
      projectId,
      trackId: body.trackId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      sourceKind: body.sourceKind,
      sourceTakeId: body.sourceTakeId,
      sourceBeatId: body.sourceBeatId,
      sourceArtifactId: body.sourceArtifactId,
      timelineStartMs: body.timelineStartMs,
      durationMs: body.durationMs,
      sourceOffsetMs: body.sourceOffsetMs,
    });
    return NextResponse.json(
      {
        success: true,
        clip: result.clip,
        documentVersion: result.documentVersion,
      },
      { status: 201 },
    );
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
