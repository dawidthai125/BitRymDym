import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { createTakeRecordingSession } from "@/lib/takes/take-transport";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * Recording Wave 2 / P2 — take signed upload session.
 * POST JSON { beatId, contentType, byteSize, replaceTakeId? }
 * Client must NOT send objectKey / ownerId / bucket / takeId.
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

    const session = await createTakeRecordingSession({
      beatId: body.beatId,
      contentType: body.contentType,
      byteSize: body.byteSize,
      replaceTakeId: body.replaceTakeId,
      objectKey: body.objectKey,
      ownerId: body.ownerId,
      bucket: body.bucket,
      takeId: body.takeId,
    });

    return NextResponse.json({ success: true, ...session });
  } catch (error) {
    if (error instanceof AuthError || error instanceof Error) {
      return takeApiErrorResponse(error);
    }
    return takeApiErrorResponse(error);
  }
}
