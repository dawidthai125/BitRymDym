import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { generateAiLyrics, getAiLyricsState } from "@/lib/studio/lyrics/ai-lyrics-server";

import { masterErrorResponse, readJson, tierOf } from "../../master/_shared";

export const runtime = "nodejs";
/** Groq (8 s) + Gemini (10 s) plus slack. */
export const maxDuration = 60;
type RouteContext = { params: Promise<{ projectId: string }> };

const STATUS: Record<string, number> = { tier_lyrics: 403, bad_request: 400, daily_limit: 429, ai_unavailable: 503 };

/** GET — Silver+ AI lyrics state: { allowed, available?, used?, perDay? }. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const state = await getAiLyricsState({ ownerId: auth.userId, projectId, tier: await tierOf(auth) });
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

/**
 * POST {mode:"keywords"|"continue"|"verse", text} — Silver+ → {text, used, perDay}.
 * Below Silver → 403 tier_lyrics + upsell; daily cap → 429; all providers down → 503 ai_unavailable.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    const r = await generateAiLyrics({ ownerId: auth.userId, projectId, tier: await tierOf(auth), mode: body.mode, text: body.text });
    if (!r.ok) return NextResponse.json({ success: false, ...r, ...(r.error === "tier_lyrics" ? { upsell: "/premium" } : {}) }, { status: STATUS[r.error] ?? 400 });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    return masterErrorResponse(error);
  }
}
