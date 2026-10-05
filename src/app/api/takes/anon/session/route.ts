import { NextResponse } from "next/server";

import { createAnonTakeRecordingSession } from "@/lib/takes/anon-take-transport";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * D02 / P2 anonymous take upload session.
 * POST JSON { beatId, contentType, byteSize, replaceTakeId? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      beatId?: string;
      contentType?: string;
      byteSize?: number;
      replaceTakeId?: string | null;
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

    void body.anonymous;

    const result = await createAnonTakeRecordingSession({
      beatId: body.beatId,
      contentType: body.contentType,
      byteSize: body.byteSize,
      replaceTakeId: body.replaceTakeId,
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
    return takeApiErrorResponse(error);
  }
}
