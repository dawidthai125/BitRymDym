import { NextResponse } from "next/server";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import {
  assertWorkerSecret,
  completeFakeRenderJobAsWorker,
  driveFakeWorkerJob,
  toRenderJobHttpStatus,
} from "@/lib/audio/render-job-service";

export const runtime = "nodejs";

/**
 * POST /api/mix/worker/fake-complete
 * Worker-secret only. Body: { jobId, mode?: "complete" | "drive" }
 * Client must not supply source object keys / URLs.
 * - complete: RUNNING → fake SUCCESS (+ placeholder artifact)
 * - drive: QUEUED → CLAIM (incl. FINDING-01 source resolve) → fake SUCCESS
 */
export async function POST(request: Request) {
  try {
    assertWorkerSecret(request.headers.get("authorization"));
    const body = (await request.json()) as Record<string, unknown>;
    rejectClientRenderSourceClaims(body);
    if (typeof body.jobId !== "string" || !body.jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    const mode = body.mode === "drive" ? "drive" : "complete";
    const result =
      mode === "drive"
        ? await driveFakeWorkerJob(body.jobId)
        : await completeFakeRenderJobAsWorker(body.jobId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      return NextResponse.json(
        { error: error.message },
        { status: toRenderJobHttpStatus(error) },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Fake complete failed.",
      },
      { status: 400 },
    );
  }
}
