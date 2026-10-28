import { NextResponse } from "next/server";

import { applyStudioMixWorkingOps } from "@/lib/studio/mix-working-apply-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

/**
 * POST — atomic Mix Working Plane apply (A1).
 * Body must not supply ownerId as an auth source.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      requestId?: unknown;
      ops?: unknown;
      ownerId?: unknown;
    };

    // Explicitly ignore any client-supplied ownerId.
    void body.ownerId;

    const result = await applyStudioMixWorkingOps({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      requestId: body.requestId,
      ops: body.ops,
    });

    return NextResponse.json({
      success: true,
      documentVersion: result.documentVersion,
      documentDigest: result.documentDigest,
      replay: result.replay,
      revisionId: result.revisionId,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
