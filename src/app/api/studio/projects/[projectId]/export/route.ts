import { NextResponse } from "next/server";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  createStudioExportJob,
  getOwnStudioExportJob,
} from "@/lib/audio/studio-export-service";
import { AuthError } from "@/lib/auth/session";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * STUDIO_EXPORT — enqueue (POST) + owner job status (GET).
 * POST { expectedDocumentVersion, idempotencyKey }
 * GET  ?jobId= — status + artifactId when SUCCEEDED (project-scoped).
 * Download uses existing GET /api/mix/artifacts/[id]/download (owner AuthZ).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const job = await createStudioExportJob({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      idempotencyKey: body.idempotencyKey,
      clientBody: body,
    });
    return NextResponse.json({
      success: true,
      jobId: job.id,
      projectId: job.projectId,
      kind: job.kind,
      requestedTier: job.requestedTier,
      status: job.status,
      documentVersion: job.documentVersion,
      documentDigest: job.documentDigest,
      artifactId: job.artifactId ?? null,
      workerInfraStatus: job.workerInfraStatus,
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

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    const job = await getOwnStudioExportJob(jobId, { projectId });
    return NextResponse.json({
      success: true,
      jobId: job.id,
      projectId: job.projectId,
      kind: job.kind,
      requestedTier: job.requestedTier,
      status: job.status,
      documentVersion: job.documentVersion,
      documentDigest: job.documentDigest,
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
    if (error instanceof AuthError) {
      return takeApiErrorResponse(error);
    }
    return takeApiErrorResponse(error);
  }
}
