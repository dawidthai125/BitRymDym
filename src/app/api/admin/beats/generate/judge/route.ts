import { NextResponse } from "next/server";

import { judgeGeneratedBeat } from "@/lib/beats/ai-beat/beat-judge-server";
import { parseYouTubeWatchUrl } from "@/lib/beats/ai-beat/youtube-style";
import { isUuid } from "@/lib/beats/audio-validation";
import { beatApiBadRequest, beatAudioApiErrorResponse } from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";
export const maxDuration = 300;

const KEY_RE = /^[A-G](?:#|b)?m?$/;

/**
 * POST JSON { beatId, youtubeUrl, targetKey? } → { verdict }
 * Gemini compares the generated draft with the video twice (averaged); the key is measured.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { beatId?: unknown; youtubeUrl?: unknown; targetKey?: unknown } | null;
  if (!isUuid(body?.beatId)) return beatApiBadRequest("Nieznany bit.");
  const url = parseYouTubeWatchUrl(body?.youtubeUrl);
  if (!url) return beatApiBadRequest("Wklej publiczny link YouTube.");
  const targetKey = typeof body?.targetKey === "string" && KEY_RE.test(body.targetKey.trim()) ? body.targetKey.trim() : null;
  try {
    const verdict = await judgeGeneratedBeat({ beatId: body.beatId, youtubeUrl: url, targetKey });
    return NextResponse.json({ success: true, verdict });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate/judge");
  }
}
