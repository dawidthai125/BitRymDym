import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { attachBeatToStudioProject } from "@/lib/studio/studio-service";
import { getProjectBeatKey } from "@/lib/studio/tune/beat-key-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — key/scale of the attached beat (BRD Tune default; key null = unknown). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const result = await getProjectBeatKey({ ownerId: auth.userId, projectId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/**
 * AUD-01 / P7.1.6 — POST attach/replace studio_projects.beat_id (+ BEAT_REF seed).
 * Body: { beatId: string, expectedDocumentVersion: number }
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
      expectedDocumentVersion?: unknown;
    };
    const beatId =
      typeof body.beatId === "string" ? body.beatId.trim() : "";
    if (!beatId) {
      return NextResponse.json({ error: "beatId is required." }, { status: 400 });
    }
    const document = await attachBeatToStudioProject({
      projectId,
      beatId,
      expectedDocumentVersion: body.expectedDocumentVersion,
    });
    return NextResponse.json({
      success: true,
      document,
      documentVersion: document.project.documentVersion,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
