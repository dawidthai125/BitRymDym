import { NextResponse } from "next/server";

import { sfmApiErrorResponse } from "@/lib/sfm/sfm-api-error";
import { getOwnSfmJobStatus } from "@/lib/sfm/sfm-version-read-service";

export const runtime = "nodejs";

/**
 * GET /api/studio/final/versions/[versionId]/jobs/[jobId]
 * Owner + version-bound SFM job status (encode / prepare / bake).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ versionId: string; jobId: string }> },
) {
  try {
    const { versionId, jobId } = await context.params;
    const job = await getOwnSfmJobStatus({ versionId, jobId });
    return NextResponse.json({ success: true, ...job });
  } catch (error) {
    return sfmApiErrorResponse(error);
  }
}
