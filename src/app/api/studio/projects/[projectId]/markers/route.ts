import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  applyStudioMarkersCas,
  listStudioProjectMarkersCas,
} from "@/lib/studio/studio-markers-persist";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — owned project markers (A3 document field). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 },
      );
    }
    const auth = await requireUser();
    const result = await listStudioProjectMarkersCas({
      ownerId: auth.userId,
      projectId,
    });
    return NextResponse.json({
      success: true,
      markers: result.markers,
      documentVersion: result.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/**
 * PATCH — add verse/hook at ms or remove by id.
 * Body must not supply ownerId as an auth source.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 },
      );
    }
    const body = (await request.json()) as {
      op?: unknown;
      kind?: unknown;
      positionMs?: unknown;
      markerId?: unknown;
      expectedDocumentVersion?: unknown;
      ownerId?: unknown;
    };
    void body.ownerId;

    const auth = await requireUser();
    const result = await applyStudioMarkersCas({
      ownerId: auth.userId,
      projectId,
      expected: body.expectedDocumentVersion,
      op: body.op,
      kind: body.kind,
      positionMs: body.positionMs,
      markerId: body.markerId,
    });
    return NextResponse.json({
      success: true,
      markers: result.markers,
      documentVersion: result.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
