import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { sampleUserMessage } from "@/lib/studio/samples/sample-policy";
import { copyStudioSampleToTake } from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sampleId: string }> },
) {
  try {
    const auth = await requireUser();
    const { sampleId } = await context.params;
    let body: { projectId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    if (typeof body.projectId !== "string") {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }
    const result = await copyStudioSampleToTake(auth, {
      sampleId,
      projectId: body.projectId,
    });
    if (!result.ok) {
      const status =
        result.error === "SAMPLE_NOT_FOUND" || result.error === "NOT_FOUND"
          ? 404
          : result.error === "SAMPLE_FORBIDDEN" || result.error === "FORBIDDEN"
            ? 403
            : result.error === "SAMPLE_TABLE_UNAVAILABLE"
              ? 503
              : 400;
      return NextResponse.json(
        {
          error: result.error,
          message: sampleUserMessage(result.error),
          details: result.details,
        },
        { status },
      );
    }
    return NextResponse.json({
      takeId: result.takeId,
      beatId: result.beatId,
      reusedExisting: result.reusedExisting,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
