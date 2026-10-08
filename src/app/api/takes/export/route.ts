import { NextResponse } from "next/server";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { AuthError } from "@/lib/auth/session";
import { takeApiErrorResponse } from "@/lib/takes/api-error";
import {
  createTakeExportJob,
  getOwnTakeExportJob,
} from "@/lib/takes/take-export-service";

export const runtime = "nodejs";

/**
 * P4.6 — enqueue TAKE_EXPORT job (no FFmpeg in request path).
 * POST { takeId, quality: MP3_128|MP3_192|MP3_320|WAV, idempotencyKey }
 *
 * GET ?jobId= — owner job status + artifactId when SUCCEEDED.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      quality?: unknown;
      idempotencyKey?: unknown;
    };
    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json({ error: "takeId is required." }, { status: 400 });
    }
    const job = await createTakeExportJob({
      takeId: body.takeId,
      quality: body.quality,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({
      success: true,
      jobId: job.id,
      takeId: job.takeId,
      quality: job.quality,
      requestedTier: job.requestedTier,
      status: job.status,
      artifactId: job.artifactId ?? null,
      workerInfraStatus: job.workerInfraStatus,
      note:
        job.workerInfraStatus === "PREPARED_CODE"
          ? "TAKE_EXPORT pipeline is prepared in app code; EXTERNAL Contabo worker remains STOPPED until Phase 2 Owner GO."
          : job.workerInfraStatus === "BLOCKED_INFRA"
            ? "Export job queued in code; EXTERNAL worker is STOPPED — not Production Ready."
            : undefined,
    });
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "DISABLED"
              ? 503
              : error.code === "LIMIT" || error.code === "CONFLICT"
                ? 409
                : error.code === "INVALID"
                  ? 400
                  : 403;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    if (error instanceof AuthError) {
      return takeApiErrorResponse(error);
    }
    return takeApiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    const job = await getOwnTakeExportJob(jobId);
    return NextResponse.json({
      success: true,
      jobId: job.id,
      takeId: job.takeId,
      quality: job.quality,
      requestedTier: job.requestedTier,
      status: job.status,
      artifactId: job.artifactId ?? null,
      workerInfraStatus: job.workerInfraStatus,
    });
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    return takeApiErrorResponse(error);
  }
}
