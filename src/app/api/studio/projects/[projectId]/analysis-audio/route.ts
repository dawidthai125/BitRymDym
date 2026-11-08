import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { signProjectAnalysisAudio } from "@/lib/studio/analysis/project-audio";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** Signed URL of the project's approved master, or its beat when there is no master. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { projectId } = await context.params;
    const signed = await signProjectAnalysisAudio(auth.userId, projectId);
    if (!signed) return NextResponse.json({ error: "no_audio" }, { status: 404 });
    return NextResponse.json(signed);
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
