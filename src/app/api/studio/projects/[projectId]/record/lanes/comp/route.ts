import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isStudioRecordingFeatureEnabled } from "@/config/studio-recording-features";
import { applyTakeLaneCompFor } from "@/lib/studio/recording/recording-store-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST {lane, expectedDocumentVersion} — put the lane's comp on the timeline
 * (replaces the clips this lane made before). Returns the fresh document.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    if (!isStudioRecordingFeatureEnabled("multiTakeComping")) {
      return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
    }
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      lane?: unknown;
      expectedDocumentVersion?: unknown;
    } | null;
    if (!body?.lane) return NextResponse.json({ error: "lane jest wymagane." }, { status: 400 });
    const result = await applyTakeLaneCompFor(auth, {
      projectId,
      lane: body.lane,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      ...result,
      documentVersion: result.document.project.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
