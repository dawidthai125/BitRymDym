import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { sfmApiErrorResponse } from "@/lib/sfm/sfm-api-error";
import { startSfmStageFor } from "@/lib/sfm/sfm-foundation-service";

export const runtime = "nodejs";

/**
 * POST /api/studio/final/versions/[versionId]/stages/start
 * Body: { kind: "SFM_MIX" | "SFM_MASTER" }
 * Enqueues SFM_MIX_PREPARE / SFM_MASTER_BAKE via sfm_start_stage.
 * RECOVERY_REQUIRED → HTTP 409 (no auto-requeue).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const stage = await startSfmStageFor(auth, {
      versionId,
      kind: body.kind,
    });
    return NextResponse.json({
      success: true,
      stageId: stage.stageId,
      versionId: stage.versionId,
      kind: stage.kind,
      status: stage.status,
      startedAt: stage.startedAt,
      jobId: stage.jobId ?? null,
    });
  } catch (error) {
    return sfmApiErrorResponse(error);
  }
}
