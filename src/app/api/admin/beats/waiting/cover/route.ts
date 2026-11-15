import { NextResponse } from "next/server";

import { generateWaitingBeatCover } from "@/lib/beats/ai-beat/cover";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";
/** xAI still plus moderation. */
export const maxDuration = 90;

/** POST JSON { beatId } → { success, coverStatus: "approved" }. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { beatId?: unknown } | null;
  if (!isUuid(body?.beatId)) {
    return beatApiBadRequest("Nieznany bit.");
  }

  try {
    const result = await generateWaitingBeatCover(body.beatId);
    return NextResponse.json({ success: true, coverStatus: result.coverStatus });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/waiting/cover");
  }
}
