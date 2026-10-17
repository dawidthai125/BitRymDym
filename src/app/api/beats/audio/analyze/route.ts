import { NextResponse } from "next/server";

import { analyzeUserBeatPendingUpload } from "@/lib/beats/audio-transport";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatAudioApiErrorResponse,
  beatApiBadRequest,
} from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";

/**
 * Community Wave 2 — USER analyze after signed binary upload.
 * POST JSON { beatId, assetId }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    assetId?: unknown;
  } | null;
  if (!body || !isUuid(body.beatId) || !isUuid(body.assetId)) {
    return beatApiBadRequest("beatId and assetId (uuid) are required.");
  }

  try {
    const result = await analyzeUserBeatPendingUpload({
      beatId: body.beatId,
      assetId: body.assetId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/beats/audio/analyze");
  }
}
