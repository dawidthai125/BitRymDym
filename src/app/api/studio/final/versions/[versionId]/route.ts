import { NextResponse } from "next/server";

import { sfmApiErrorResponse } from "@/lib/sfm/sfm-api-error";
import { getOwnSfmVersionStatus } from "@/lib/sfm/sfm-version-read-service";

export const runtime = "nodejs";

/**
 * GET /api/studio/final/versions/[versionId]
 * Owner-scoped version + stages + grant + recent jobs + current artifacts.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await context.params;
    const record = await getOwnSfmVersionStatus(versionId);
    return NextResponse.json({ success: true, ...record });
  } catch (error) {
    return sfmApiErrorResponse(error);
  }
}
