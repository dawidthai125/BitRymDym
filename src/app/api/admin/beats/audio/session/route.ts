import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { createPlatformBeatSignedUploadSession } from "@/lib/beats/audio-transport";

export const runtime = "nodejs";

/**
 * POST JSON { contentType, byteSize, originalFilename? }
 * → DRAFT beat + PENDING_UPLOAD asset + signed upload credentials.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      contentType?: string;
      byteSize?: number;
      originalFilename?: string | null;
    };

    if (
      typeof body.contentType !== "string" ||
      typeof body.byteSize !== "number" ||
      !Number.isInteger(body.byteSize)
    ) {
      return NextResponse.json(
        { error: "contentType and integer byteSize are required." },
        { status: 400 },
      );
    }

    const session = await createPlatformBeatSignedUploadSession({
      contentType: body.contentType,
      byteSize: body.byteSize,
      originalFilename: body.originalFilename ?? null,
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
