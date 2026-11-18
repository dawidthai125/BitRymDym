import { NextResponse } from "next/server";

import { sliceBitekMessages } from "@/lib/beats/ai-beat/bitek-review";
import { reviseWaitingBeat, talkAboutWaitingBeat } from "@/lib/beats/ai-beat/bitek";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";
export const maxDuration = 200;

/**
 * POST JSON { action: "talk", beatId, messages } → { reply }
 * POST JSON { action: "revise", beatId, note } → generation started, old draft kept.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    beatId?: unknown;
    messages?: unknown;
    note?: unknown;
    youtubeUrl?: unknown;
    brief?: unknown;
  } | null;

  if (!isUuid(body?.beatId)) {
    return beatApiBadRequest("Nieznany bit.");
  }

  try {
    if (body.action === "talk") {
      const reply = await talkAboutWaitingBeat(body.beatId, sliceBitekMessages(body.messages));
      return NextResponse.json({ success: true, reply });
    }
    if (body.action === "revise") {
      if (typeof body.note !== "string") {
        return beatApiBadRequest("Napisz, co zmienić.");
      }
      const started = await reviseWaitingBeat(body.beatId, body.note, {
        youtubeUrl: typeof body.youtubeUrl === "string" ? body.youtubeUrl : null,
        brief: typeof body.brief === "string" ? body.brief.slice(0, 1000) : null,
      });
      return NextResponse.json({ success: true, ...started });
    }
    return beatApiBadRequest("Nieznana akcja.");
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate/bitek");
  }
}
