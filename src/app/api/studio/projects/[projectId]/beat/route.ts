import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { attachBeatToStudioProject } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * AUD-01 — POST attach/replace studio_projects.beat_id (+ BEAT_REF seed).
 * Body: { beatId: string }
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      beatId?: unknown;
    };
    const beatId =
      typeof body.beatId === "string" ? body.beatId.trim() : "";
    if (!beatId) {
      return NextResponse.json({ error: "beatId is required." }, { status: 400 });
    }
    const document = await attachBeatToStudioProject({ projectId, beatId });
    return NextResponse.json({ success: true, document });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
