import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { sfmApiErrorResponse } from "@/lib/sfm/sfm-api-error";
import { enqueueSfmQualityEncodeFor } from "@/lib/sfm/sfm-executor-service";

export const runtime = "nodejs";

/**
 * POST /api/studio/final/versions/[versionId]/encode
 * Body: { quality: SfmQuality, idempotencyKey: string }
 * Lazy QUALITY encode — requires version grant + quality ∈ snapshot.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const job = await enqueueSfmQualityEncodeFor(auth, {
      versionId,
      quality: body.quality,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({
      success: true,
      jobId: job.jobId,
      versionId: job.versionId,
      kind: job.kind,
      status: job.status,
      sfmQuality: job.sfmQuality,
    });
  } catch (error) {
    return sfmApiErrorResponse(error);
  }
}
