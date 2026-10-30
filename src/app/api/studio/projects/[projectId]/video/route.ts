import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getAiCoverState } from "@/lib/studio/video/ai-cover/server";
import { commitYoutubeVideo, getYoutubeVideoState } from "@/lib/studio/video/server";

import { DENY_STATUS, masterErrorResponse, readJson, tierOf } from "../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — Gold YouTube MP4 state (plan gate, approved master, beat cover, latest video, AI cover usage). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const tier = await tierOf(auth);
    const state = await getYoutubeVideoState({ ownerId: auth.userId, projectId, tier });
    // AI cover generator (Gold): its own table — missing migration / error never breaks the video state.
    const ai = state.available ? await getAiCoverState({ ownerId: auth.userId, projectId, tier }).catch(() => null) : null;
    return NextResponse.json({ success: true, tier, ...state, ai });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

/**
 * POST {source:"cover"|"upload", imageId?, title?, artist?} → 202 {jobId} (poll /jobs/[jobId]).
 * Below Gold → 403 {error:"tier_video", upsell:"/premium"} (tier from the server entitlement).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    const tier = await tierOf(auth);
    const r = await commitYoutubeVideo({ ownerId: auth.userId, projectId, tier, source: body.source, imageId: body.imageId, title: body.title, artist: body.artist });
    if (!r.ok) return NextResponse.json({ success: false, ...r, ...(r.error === "tier_video" ? { upsell: "/premium" } : {}) }, { status: DENY_STATUS[r.error] ?? 400 });
    return NextResponse.json({ success: true, ...r }, { status: 202 });
  } catch (error) {
    return masterErrorResponse(error);
  }
}
