import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { createOwnTakePreviewSignedUrl } from "@/lib/takes/take-preview";

export const runtime = "nodejs";

/**
 * Recording Wave 3 — owner-only signed READ for take-only preview.
 * POST JSON { takeId }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      ownerId?: string | null;
      objectKey?: string | null;
    };

    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    // Client must not supply storage identity — ignored.
    void body.ownerId;
    void body.objectKey;

    const result = await createOwnTakePreviewSignedUrl({
      takeId: body.takeId,
    });
    return NextResponse.json({ success: true, ...result });
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
          error instanceof Error ? error.message : "Take preview failed.",
      },
      { status: 400 },
    );
  }
}
