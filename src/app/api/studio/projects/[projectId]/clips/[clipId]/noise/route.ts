import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { commitClipNoiseUpload, prepareClipNoiseUpload } from "@/lib/studio/noise/noise-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string; clipId: string }> };

/** Prepare or commit a full-length noise-profile WAV for a vocal take. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { projectId, clipId } = await context.params;
    const body = (await request.json().catch(() => null)) as { action?: unknown; jobId?: unknown } | null;
    if (body?.action === "prepare") {
      const result = await prepareClipNoiseUpload({ ownerId: auth.userId, projectId, clipId });
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 409;
        return NextResponse.json(result, { status });
      }
      return NextResponse.json(result);
    }
    if (body?.action === "commit" && typeof body.jobId === "string") {
      const result = await commitClipNoiseUpload({ ownerId: auth.userId, projectId, clipId, jobId: body.jobId });
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : result.error === "take_unavailable" ? 409 : 400;
        return NextResponse.json(result, { status });
      }
      return NextResponse.json(result);
    }
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) return studioApiErrorResponse(error);
    return studioApiErrorResponse(error);
  }
}
