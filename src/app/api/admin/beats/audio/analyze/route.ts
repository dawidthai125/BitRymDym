import { NextResponse } from "next/server";

import {
  beatAudioApiErrorResponse,
  beatApiBadRequest,
} from "@/lib/beats/beat-operation-error";
import { analyzePlatformBeatPendingUpload } from "@/lib/beats/audio-transport";
import { isUuid } from "@/lib/beats/audio-validation";

export const runtime = "nodejs";

/**
 * POST JSON { beatId, assetId }
 * → download private object → duration + BPM V1 → draft duration update.
 * Asset remains PENDING_UPLOAD (not READY).
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
    const result = await analyzePlatformBeatPendingUpload({
      beatId: body.beatId,
      assetId: body.assetId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return beatAudioApiErrorResponse(
      error,
      "api/admin/beats/audio/analyze",
    );
  }
}
