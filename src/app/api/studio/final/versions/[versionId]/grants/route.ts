import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { sfmApiErrorResponse } from "@/lib/sfm/sfm-api-error";
import { claimSfmVersionGrantFor } from "@/lib/sfm/sfm-grant-service";

export const runtime = "nodejs";

/**
 * POST /api/studio/final/versions/[versionId]/grants
 * Claim (or reuse) version grant. Plan/qualities/day are server-derived.
 * Rejects client-supplied premiumTier / grantedQualities / quality / userId.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await context.params;
    const auth = await requireUser();
    let clientBody: Record<string, unknown> = {};
    try {
      clientBody = (await request.json()) as Record<string, unknown>;
    } catch {
      clientBody = {};
    }
    const grant = await claimSfmVersionGrantFor(auth, {
      versionId,
      clientBody,
    });
    return NextResponse.json({
      success: true,
      grantId: grant.grantId,
      versionId: grant.versionId,
      source: grant.source,
      grantedAt: grant.grantedAt,
      grantedQualities: grant.grantedQualities,
      dayBucket: grant.dayBucket,
      reused: grant.reused,
    });
  } catch (error) {
    return sfmApiErrorResponse(error);
  }
}
