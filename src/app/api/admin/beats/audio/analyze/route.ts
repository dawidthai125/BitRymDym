import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { analyzePlatformBeatPendingUpload } from "@/lib/beats/audio-transport";

export const runtime = "nodejs";

/**
 * POST JSON { beatId, assetId }
 * → download private object → duration + BPM V1 → draft duration update.
 * Asset remains PENDING_UPLOAD (not READY).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      beatId?: string;
      assetId?: string;
    };
    if (typeof body.beatId !== "string" || typeof body.assetId !== "string") {
      return NextResponse.json(
        { error: "beatId and assetId are required." },
        { status: 400 },
      );
    }

    const result = await analyzePlatformBeatPendingUpload({
      beatId: body.beatId,
      assetId: body.assetId,
    });

    return NextResponse.json({ success: true, ...result });
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
          error instanceof Error ? error.message : "Analiza audio nie powiodła się.",
      },
      { status: 400 },
    );
  }
}
