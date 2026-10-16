import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { sfmApiErrorResponse } from "@/lib/sfm/sfm-api-error";
import { acceptSfmVersionFor } from "@/lib/sfm/sfm-foundation-service";

export const runtime = "nodejs";

/**
 * POST /api/studio/projects/[projectId]/final/accept
 * Body: { expectedDocumentVersion: number }
 * Explicit Accept → immutable version + PENDING stages (SFM_VERSIONS_V1).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const record = await acceptSfmVersionFor(auth, {
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      versionId: record.versionId,
      projectId: record.projectId,
      status: record.status,
      sourceDocumentVersion: record.sourceDocumentVersion,
      contentDigest: record.contentDigest,
      acceptedAt: record.acceptedAt,
      mixStageStatus: record.mixStageStatus,
      masterStageStatus: record.masterStageStatus,
    });
  } catch (error) {
    return sfmApiErrorResponse(error);
  }
}
