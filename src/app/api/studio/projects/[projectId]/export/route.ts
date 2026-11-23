import { NextResponse } from "next/server";

import { AudioEntitlementError, hasAudioCapability } from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { capabilityForRenderTier, RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  createStudioExportJob,
  getLatestOwnStudioExportJob,
  getOwnStudioExportJob,
} from "@/lib/audio/studio-export-service";
import { STUDIO_EXPORT_MVP_TIER } from "@/config/audio-render";
import { AuthError, requireUser } from "@/lib/auth/session";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * STUDIO_EXPORT — enqueue (POST) + owner job status (GET).
 * POST { expectedDocumentVersion, idempotencyKey }
 * GET  ?jobId= — status + artifactId when SUCCEEDED (project-scoped).
 * GET  (no jobId) — I.45AU latest own STUDIO_EXPORT for project (read-only; no enqueue).
 * I.17 — both GET paths return allowlisted errorCode/errorMessage when terminal-fail.
 * Download routing (OD-SFM-ID-06 UI wire): status returns trusted sfmVersionId;
 * client picks SFM vs mix download route. Server AuthZ unchanged.
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
      sfmVersionId: job.sfmVersionId ?? null,
      workerInfraStatus: job.workerInfraStatus,
      errorCode: job.errorCode ?? null,
      errorMessage: job.errorMessage ?? null,
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
    if (error instanceof AudioEntitlementError) {
      return planErrorResponse(error);
    }
    if (error instanceof AuthError) {
      return takeApiErrorResponse(error);
    }
    return takeApiErrorResponse(error);
  }
}

/** The plan does not cover the export: say which one does instead of a generic "try again". */
function planErrorResponse(error: AudioEntitlementError) {
  if (error.code === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Zaloguj się, aby eksportować projekt.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  return NextResponse.json({ error: "Eksport WAV jest w planie Gold.", code: "PLAN" }, { status: 403 });
}

/** UI mirror of the plan check in createStudioExportJobFor (the server decides again on POST). */
async function canExportWav(): Promise<boolean> {
  const entitlement = await resolveAudioEntitlementForAuthContext(await requireUser());
  return hasAudioCapability(entitlement, capabilityForRenderTier(STUDIO_EXPORT_MVP_TIER));
}

function studioExportJobStatusJson(job: {
  id: string;
  projectId: string;
  kind: string;
  requestedTier: string;
  status: string;
  documentVersion: number;
  documentDigest: string;
  artifactId?: string | null;
  sfmVersionId?: string | null;
  workerInfraStatus: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  return {
    success: true as const,
    jobId: job.id,
    projectId: job.projectId,
    kind: job.kind,
    requestedTier: job.requestedTier,
    status: job.status,
    documentVersion: job.documentVersion,
    documentDigest: job.documentDigest,
    artifactId: job.artifactId ?? null,
    sfmVersionId: job.sfmVersionId ?? null,
    workerInfraStatus: job.workerInfraStatus,
    // I.17 — allowlisted public failure fields (null when not terminal-fail).
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const jobId = new URL(request.url).searchParams.get("jobId");

    // I.45AU — latest recovery (no enqueue). Empty ≠ error; does not POST.
    if (!jobId) {
      const latest = await getLatestOwnStudioExportJob(projectId);
      const canExport = await canExportWav();
      if (!latest) {
        return NextResponse.json({
          success: true,
          found: false,
          projectId,
          canExport,
        });
      }
      return NextResponse.json({
        ...studioExportJobStatusJson(latest),
        found: true,
        canExport,
      });
    }

    const job = await getOwnStudioExportJob(jobId, { projectId });
    return NextResponse.json(studioExportJobStatusJson(job));
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
