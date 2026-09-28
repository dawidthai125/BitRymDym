import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { createAnonTakeRecordingSession } from "@/lib/takes/anon-take-transport";

export const runtime = "nodejs";

/**
 * D02 anonymous take upload session.
 * POST JSON { beatId, contentType, byteSize }
 * Cookie → hash is authority; client anonymous flag is ignored.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      beatId?: string;
      contentType?: string;
      byteSize?: number;
      objectKey?: string | null;
      ownerId?: string | null;
      bucket?: string | null;
      takeId?: string | null;
      anonymous?: boolean;
    };

    if (typeof body.beatId !== "string" || !body.beatId) {
      return NextResponse.json(
        { error: "beatId is required." },
        { status: 400 },
      );
    }
    if (typeof body.contentType !== "string" || !body.contentType) {
      return NextResponse.json(
        { error: "contentType is required." },
        { status: 400 },
      );
    }
    if (typeof body.byteSize !== "number" || !Number.isFinite(body.byteSize)) {
      return NextResponse.json(
        { error: "byteSize is required." },
        { status: 400 },
      );
    }

    // Client anonymous=true / storage identity are never AuthZ authority.
    void body.anonymous;

    const result = await createAnonTakeRecordingSession({
      beatId: body.beatId,
      contentType: body.contentType,
      byteSize: body.byteSize,
      objectKey: body.objectKey,
      ownerId: body.ownerId,
      bucket: body.bucket,
      takeId: body.takeId,
    });

    return NextResponse.json({
      success: true,
      takeId: result.takeId,
      beatId: result.beatId,
      path: result.path,
      token: result.token,
      signedUrl: result.signedUrl,
      contentType: result.contentType,
      maxRecordingSeconds: result.maxRecordingSeconds,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "NOT_FOUND"
            ? 404
            : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Anonymous take session failed.",
      },
      { status: 400 },
    );
  }
}
