import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { duplicateStudioClip } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; clipId: string }>;
};

/**
 * POST — Duplicate Clip (new Clip row, same source Take/Beat/Artifact refs).
 * Take bytes / Storage remain untouched. Atomic CAS + document_version.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId, clipId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
    };
    const result = await duplicateStudioClip({
      projectId,
      clipId,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json(
      {
        success: true,
        original: result.original,
        duplicate: result.duplicate,
        documentVersion: result.documentVersion,
      },
      { status: 201 },
    );
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
