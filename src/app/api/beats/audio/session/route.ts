import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { createUserBeatSignedUploadSession } from "@/lib/beats/audio-transport";

export const runtime = "nodejs";

/**
 * Community Wave 2 — USER signed upload session.
 * POST JSON { beatId, contentType, byteSize, originalFilename? }
 * Client must NOT send objectKey / ownerId / bucket / assetId.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      beatId?: string;
      contentType?: string;
      byteSize?: number;
      originalFilename?: string | null;
      objectKey?: string | null;
      ownerId?: string | null;
      bucket?: string | null;
      assetId?: string | null;
    };

    if (
      typeof body.beatId !== "string" ||
      typeof body.contentType !== "string" ||
      typeof body.byteSize !== "number" ||
      !Number.isInteger(body.byteSize)
    ) {
      return NextResponse.json(
        { error: "beatId, contentType and integer byteSize are required." },
        { status: 400 },
      );
    }

    const session = await createUserBeatSignedUploadSession({
      beatId: body.beatId,
      contentType: body.contentType,
      byteSize: body.byteSize,
      originalFilename: body.originalFilename ?? null,
      objectKey: body.objectKey,
      ownerId: body.ownerId,
      bucket: body.bucket,
      assetId: body.assetId,
    });

    return NextResponse.json({ success: true, ...session });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "FORBIDDEN" ? 403 : 401 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Upload session failed.",
      },
      { status: 400 },
    );
  }
}
