import { NextResponse } from "next/server";

import { requestBeatAudioAccess } from "@/lib/beats/audio-access";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  BEAT_AUDIO_INTERNAL_ERROR,
  beatApiBadRequest,
  classifyBeatOperationError,
} from "@/lib/beats/beat-operation-error";
import { toSafePlaybackErrorMessage } from "@/lib/beats/public";

export const runtime = "nodejs";

const FORBIDDEN = ["purpose", "objectKey", "ownerId", "bucket", "assetId"] as const;

/**
 * Logged-in catalog listen. PLAYBACK only, same gate as the site player.
 * DOWNLOAD stays on the beat-detail action. No storage key in the body or the answer.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    purpose?: unknown;
    objectKey?: unknown;
    ownerId?: unknown;
    bucket?: unknown;
    assetId?: unknown;
  } | null;

  if (!body || FORBIDDEN.some((key) => body[key] != null)) {
    return beatApiBadRequest("Niedozwolone parametry odsłuchu.");
  }
  if (!isUuid(body.beatId)) {
    return beatApiBadRequest("beatId (uuid) jest wymagane.");
  }

  try {
    const result = await requestBeatAudioAccess({
      beatId: body.beatId,
      purpose: "PLAYBACK",
    });
    if (!result.url.startsWith("https://")) {
      return NextResponse.json(
        { error: BEAT_AUDIO_INTERNAL_ERROR, code: "INTERNAL" },
        { status: 500 },
      );
    }
    const payload: {
      url: string;
      expiresAt: string;
      previewLimitSeconds?: number;
    } = { url: result.url, expiresAt: result.expiresAt };
    if (typeof result.previewLimitSeconds === "number") {
      payload.previewLimitSeconds = result.previewLimitSeconds;
    }
    return NextResponse.json(payload);
  } catch (error) {
    const classified = classifyBeatOperationError(
      error,
      "api/beats/audio/playback",
      BEAT_AUDIO_INTERNAL_ERROR,
    );
    return NextResponse.json(
      {
        error: toSafePlaybackErrorMessage(classified.message),
        code: classified.code,
      },
      { status: classified.status },
    );
  }
}
