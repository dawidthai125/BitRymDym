import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { placeReadyTakeAsStudioClip } from "@/lib/studio/studio-record-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST — place a READY Take as a Studio Clip at the captured playhead.
 * Auth + project ownership enforced in service. Client must not send storage keys.
 * CAS: expectedDocumentVersion required (idempotent reuse returns current version).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      trackId?: string;
      takeId?: string;
      timelineStartMs?: number;
      expectedDocumentVersion?: unknown;
      ownerId?: string | null;
      objectKey?: string | null;
    };

    // Reject client-chosen storage / ownership identity (P4 contract).
    if (body.ownerId != null || body.objectKey != null) {
      return NextResponse.json(
        { error: "Niedozwolone parametry storage / ownership." },
        { status: 400 },
      );
    }

    if (!body.trackId || !body.takeId) {
      return NextResponse.json(
        { error: "trackId i takeId są wymagane." },
        { status: 400 },
      );
    }
    if (typeof body.timelineStartMs !== "number") {
      return NextResponse.json(
        { error: "timelineStartMs jest wymagane (integer ms)." },
        { status: 400 },
      );
    }

    const result = await placeReadyTakeAsStudioClip({
      projectId,
      trackId: body.trackId,
      takeId: body.takeId,
      timelineStartMs: body.timelineStartMs,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });

    return NextResponse.json(
      {
        success: true,
        clip: result.clip,
        takeId: result.takeId,
        durationMs: result.durationMs,
        reusedExisting: result.reusedExisting,
        documentVersion: result.documentVersion,
      },
      { status: result.reusedExisting ? 200 : 201 },
    );
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
