import { NextResponse } from "next/server";

import { createUserBeatSignedUploadSession } from "@/lib/beats/audio-transport";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatAudioApiErrorResponse,
  beatApiBadRequest,
} from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";

// Passed through untouched: any non-empty value is rejected by the transport.
type StorageParam = string | null | undefined;

/**
 * Community Wave 2 — USER signed upload session.
 * POST JSON { beatId, contentType, byteSize, originalFilename? }
 * Client must NOT send objectKey / ownerId / bucket / assetId.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    contentType?: unknown;
    byteSize?: unknown;
    originalFilename?: unknown;
    objectKey?: unknown;
    ownerId?: unknown;
    bucket?: unknown;
    assetId?: unknown;
  } | null;

  if (
    !body ||
    !isUuid(body.beatId) ||
    typeof body.contentType !== "string" ||
    typeof body.byteSize !== "number" ||
    !Number.isInteger(body.byteSize)
  ) {
    return beatApiBadRequest(
      "beatId (uuid), contentType and integer byteSize are required.",
    );
  }

  try {
    const session = await createUserBeatSignedUploadSession({
      beatId: body.beatId,
      contentType: body.contentType,
      byteSize: body.byteSize,
      originalFilename:
        typeof body.originalFilename === "string" ? body.originalFilename : null,
      objectKey: body.objectKey as StorageParam,
      ownerId: body.ownerId as StorageParam,
      bucket: body.bucket as StorageParam,
      assetId: body.assetId as StorageParam,
    });

    return NextResponse.json({ success: true, ...session });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/beats/audio/session");
  }
}
