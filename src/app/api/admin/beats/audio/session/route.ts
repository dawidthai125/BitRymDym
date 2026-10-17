import { NextResponse } from "next/server";

import {
  beatAudioApiErrorResponse,
  beatApiBadRequest,
} from "@/lib/beats/beat-operation-error";
import { createPlatformBeatSignedUploadSession } from "@/lib/beats/audio-transport";

export const runtime = "nodejs";

/**
 * POST JSON { contentType, byteSize, originalFilename? }
 * → DRAFT beat + PENDING_UPLOAD asset + signed upload credentials.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    contentType?: unknown;
    byteSize?: unknown;
    originalFilename?: unknown;
  } | null;

  if (
    !body ||
    typeof body.contentType !== "string" ||
    typeof body.byteSize !== "number" ||
    !Number.isInteger(body.byteSize)
  ) {
    return beatApiBadRequest(
      "contentType and integer byteSize are required.",
    );
  }

  try {
    const session = await createPlatformBeatSignedUploadSession({
      contentType: body.contentType,
      byteSize: body.byteSize,
      originalFilename:
        typeof body.originalFilename === "string" ? body.originalFilename : null,
    });

    return NextResponse.json({ success: true, ...session });
  } catch (error) {
    return beatAudioApiErrorResponse(
      error,
      "api/admin/beats/audio/session",
    );
  }
}
