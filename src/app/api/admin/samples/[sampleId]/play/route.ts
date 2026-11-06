import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/session";
import { requireModerationAccess } from "@/lib/beats/service";
import { signStudioSamplePlayback } from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sampleId: string }> },
) {
  try {
    await requireModerationAccess();
    const auth = await requireUser();
    const { sampleId } = await context.params;
    const result = await signStudioSamplePlayback(
      { userId: auth.userId, moderator: true },
      sampleId,
    );
    if (!result.ok || !result.url.startsWith("https://")) {
      return NextResponse.json({ error: "Playback unavailable." }, { status: 404 });
    }
    return NextResponse.redirect(result.url);
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
