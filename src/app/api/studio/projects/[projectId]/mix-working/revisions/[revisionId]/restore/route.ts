import { NextResponse } from "next/server";

import { restoreMixWorkingRevision } from "@/lib/studio/mix-working-revision-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; revisionId: string }>;
};

/**
 * POST — restore a prior revision via A1 atomic apply (new tip + new revision).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, revisionId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      requestId?: unknown;
      ownerId?: unknown;
    };
    void body.ownerId;
    const result = await restoreMixWorkingRevision({
      projectId,
      revisionId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      requestId: body.requestId,
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
