import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import {
  createOwnSfmArtifactDownloadSignedUrl,
  toSfmDownloadHttpStatus,
} from "@/lib/sfm/sfm-artifact-download";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ artifactId: string }> };

/**
 * GET /api/studio/artifacts/[artifactId]/download
 * OD-SFM-ID-01 dedicated SFM download. OD-SFM-ID-06 — legacy (no sfm_version_id) DENY.
 * Never accepts client object_key. Never signs URL before AuthZ completes.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const url = new URL(request.url);
    const probe: Record<string, unknown> = {};
    for (const key of url.searchParams.keys()) {
      probe[key] = url.searchParams.get(key);
    }
    rejectClientRenderSourceClaims(probe);

    const { artifactId } = await context.params;
    const result = await createOwnSfmArtifactDownloadSignedUrl({ artifactId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthError || error instanceof SfmDomainError) {
      return NextResponse.json(
        { error: error.message },
        { status: toSfmDownloadHttpStatus(error) },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "SFM artifact download failed.",
      },
      { status: 400 },
    );
  }
}
