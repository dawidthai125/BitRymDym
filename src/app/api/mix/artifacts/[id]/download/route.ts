import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { createOwnArtifactDownloadSignedUrl } from "@/lib/audio/artifact-download";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { toRenderJobHttpStatus } from "@/lib/audio/render-job-service";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/mix/artifacts/[id]/download
 * Owner signed GET — FINDING-03 requires READY + job SUCCEEDED.
 * Never accepts client object_key.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const url = new URL(request.url);
    // Reject query-supplied storage keys if present.
    const probe: Record<string, unknown> = {};
    for (const key of url.searchParams.keys()) {
      probe[key] = url.searchParams.get(key);
    }
    rejectClientRenderSourceClaims(probe);

    const { id } = await context.params;
    const result = await createOwnArtifactDownloadSignedUrl({ artifactId: id });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      return NextResponse.json(
        { error: error.message },
        { status: toRenderJobHttpStatus(error) },
      );
    }
    if (error instanceof AuthError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "NOT_FOUND"
            ? 404
            : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof AudioEntitlementError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.code === "UNAUTHENTICATED" ? 401 : 403,
        },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Artifact download failed.",
      },
      { status: 400 },
    );
  }
}
