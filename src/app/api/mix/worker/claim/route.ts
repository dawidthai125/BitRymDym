import { NextResponse } from "next/server";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  assertWorkerSecret,
  claimRenderJobAsWorker,
  toRenderJobHttpStatus,
} from "@/lib/audio/render-job-service";

export const runtime = "nodejs";

/**
 * POST /api/mix/worker/claim
 * Worker-secret only. Body: { jobId }
 * CLAIM starts 180s timeout clock (IP-03).
 */
export async function POST(request: Request) {
  try {
    assertWorkerSecret(request.headers.get("authorization"));
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.jobId !== "string" || !body.jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    const job = await claimRenderJobAsWorker(body.jobId);
    return NextResponse.json({ success: true, job });
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
