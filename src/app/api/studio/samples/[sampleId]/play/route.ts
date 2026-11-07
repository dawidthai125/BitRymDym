import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { sampleUserMessage } from "@/lib/studio/samples/sample-policy";
import { signStudioSamplePlayback } from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sampleId: string }> },
) {
  try {
    const auth = await requireUser();
    const { sampleId } = await context.params;
    const result = await signStudioSamplePlayback(
      { userId: auth.userId, moderator: false },
      sampleId,
    );
    if (!result.ok) {
      const status =
        result.error === "SAMPLE_NOT_FOUND"
          ? 404
          : result.error === "SAMPLE_FORBIDDEN"
            ? 403
            : result.error === "SAMPLE_TABLE_UNAVAILABLE"
              ? 503
              : 400;
      return NextResponse.json(
        { error: result.error, message: sampleUserMessage(result.error) },
        { status },
      );
    }
    return NextResponse.json({ url: result.url });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
