import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { BeatRequestError } from "@/lib/beats/request-error";
import { setProjectImageAsBeatCover } from "@/lib/studio/video/ai-cover/server";

import { DENY_STATUS, masterErrorResponse, readJson } from "../../../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST {imageId} — set a project video image (e.g. the AI cover) as the cover of the
 * project's beat, only when it is the user's own beat. Runs the full beat-cover pipeline
 * (cooldown, square crop, Gemini moderation, moderator queue on "review").
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    const r = await setProjectImageAsBeatCover({ context: auth, projectId, imageId: body?.imageId });
    if (!r.ok) return NextResponse.json({ success: false, ...r }, { status: DENY_STATUS[r.error] ?? 400 });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    if (error instanceof BeatRequestError) return NextResponse.json({ success: false, error: "cover_rejected", message: error.message }, { status: 422 });
    return masterErrorResponse(error);
  }
}
