import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { sampleUserMessage } from "@/lib/studio/samples/sample-policy";
import { readStudioSampleForListening } from "@/lib/studio/samples/sample-service";

export const runtime = "nodejs";

/**
 * GET — sample audio for in-page listening only (signed-in; owner or PUBLISHED).
 * Served through the app so no storage URL is handed out; never cached, inline only.
 */
export async function GET(_request: Request, context: { params: Promise<{ sampleId: string }> }) {
  try {
    const auth = await requireUser();
    const { sampleId } = await context.params;
    const result = await readStudioSampleForListening({ userId: auth.userId, moderator: false }, sampleId);
    if (!result.ok) {
      const status = result.error === "SAMPLE_NOT_FOUND" ? 404 : result.error === "SAMPLE_FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: result.error, message: sampleUserMessage(result.error) }, { status });
    }
    return new Response(result.bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.bytes.byteLength),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
