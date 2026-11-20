import { NextResponse } from "next/server";

import {
  describeBeatStyleFromYouTube,
  parseYouTubeWatchUrl,
} from "@/lib/beats/ai-beat/youtube-style";
import { parseReferenceMeasure } from "@/lib/beats/ai-beat/reference-tempo";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST JSON { url, measured? } — measured = tempo/key from the uploaded reference file.
 * Gemini listens to a public YouTube link and returns a style description.
 * The file is not downloaded and the link is not stored.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; measured?: unknown } | null;
  const url = parseYouTubeWatchUrl(body?.url);
  if (!url) {
    return beatApiBadRequest(
      "Wklej publiczny link YouTube (watch, youtu.be albo shorts). Inne strony z odtwarzaczem nie działają.",
    );
  }

  try {
    const described = await describeBeatStyleFromYouTube(url, { measured: parseReferenceMeasure(body?.measured) });
    return NextResponse.json({ success: true, ...described });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate/style");
  }
}
