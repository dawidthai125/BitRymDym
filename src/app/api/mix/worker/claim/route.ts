import { NextResponse } from "next/server";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import {
  assertWorkerSecret,
  claimRenderJobAsWorker,
  toRenderJobHttpStatus,
} from "@/lib/audio/render-job-service";

export const runtime = "nodejs";

/**
 * POST /api/mix/worker/claim
 * Worker-secret only. Body: { jobId } — no client source keys/URLs.
 * CLAIM: FINDING-01 source re-validation → RUNNING + 180s timeout.
 * Returns server-minted signed source URLs for EXTERNAL worker fetch.
 */
export async function POST(request: Request) {
  try {
    assertWorkerSecret(request.headers.get("authorization"));
    const body = (await request.json()) as Record<string, unknown>;
    rejectClientRenderSourceClaims(body);
    if (typeof body.jobId !== "string" || !body.jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    const { job, sources } = await claimRenderJobAsWorker(body.jobId);
    return NextResponse.json({ success: true, job, sources });
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      return NextResponse.json(
        { error: error.message },
        { status: toRenderJobHttpStatus(error) },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claim failed." },
      { status: 400 },
    );
  }
}
