import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { BeatRequestError } from "@/lib/beats/request-error";
import { generateAiCover } from "@/lib/studio/video/ai-cover/server";

import { DENY_STATUS, masterErrorResponse, readJson, tierOf } from "../../master/_shared";

export const runtime = "nodejs";
/** Groq screening + up to 2 providers × 25 s + Gemini filter. */
export const maxDuration = 90;
type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST {prompt, aspect:"16:9"|"1:1"} — Gold AI cover → {imageId, previewUrl, provider, used, perDay}.
 * The imageId is a normal project video image (`source:"upload"` on POST /video).
 * Below Gold → 403 tier_video + upsell; all providers down → 503 ai_unavailable (friendly PL message).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    const tier = await tierOf(auth);
    const r = await generateAiCover({ ownerId: auth.userId, projectId, tier, prompt: body.prompt, aspect: body.aspect });
    if (!r.ok) return NextResponse.json({ success: false, ...r, ...(r.error === "tier_video" ? { upsell: "/premium" } : {}) }, { status: DENY_STATUS[r.error] ?? 400 });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    if (error instanceof BeatRequestError) return NextResponse.json({ success: false, error: "image_rejected", message: error.message }, { status: 422 });
    return masterErrorResponse(error);
  }
}
