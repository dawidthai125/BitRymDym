import { NextResponse } from "next/server";

import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";
import { requestWaitingOpsMp3Download } from "@/lib/beats/ops-mp3/ops-mp3-service";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST JSON { beatId, title? }
 * Returns a signed Contabo-built MP3 when ready, or { status: "pending" }.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    title?: unknown;
  } | null;
  if (!isUuid(body?.beatId)) {
    return beatApiBadRequest("beatId (uuid) is required.");
  }
  const title = typeof body?.title === "string" ? body.title : "bit";

  try {
    const state = await requestWaitingOpsMp3Download({
      beatId: body.beatId,
      title,
    });
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/waiting/mp3");
  }
}
