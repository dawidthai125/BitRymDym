import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { SAMPLE_SHARE_OFF, sampleUserMessage } from "@/lib/studio/samples/sample-policy";
import { updateStudioSampleShare } from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sampleId: string }> },
) {
  try {
    const auth = await requireUser();
    const { sampleId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      publicListing?: unknown;
      allowComments?: unknown;
    } | null;
    const result = await updateStudioSampleShare(auth, sampleId, {
      publicListing: typeof body?.publicListing === "boolean" ? body.publicListing : undefined,
      allowComments: typeof body?.allowComments === "boolean" ? body.allowComments : undefined,
    });
    if (!result.ok) {
      const status =
        result.error === "SAMPLE_NOT_FOUND"
          ? 404
          : result.error === "SAMPLE_FORBIDDEN"
            ? 403
            : result.error === SAMPLE_SHARE_OFF || result.error === "SAMPLE_TABLE_UNAVAILABLE"
              ? 503
              : 400;
      return NextResponse.json(
        { error: result.error, message: sampleUserMessage(result.error), details: result.details },
        { status },
      );
    }
    return NextResponse.json({ sample: result.sample });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
