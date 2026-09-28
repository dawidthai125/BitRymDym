import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { createAnonTakePreviewSignedUrl } from "@/lib/takes/anon-take-preview";

export const runtime = "nodejs";

/**
 * D02 anonymous take preview — short-lived signed GET.
 * Not download. Not take-download module.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      ownerId?: string | null;
      objectKey?: string | null;
      anonymous?: boolean;
    };

    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    void body.ownerId;
    void body.objectKey;
    void body.anonymous;

    const result = await createAnonTakePreviewSignedUrl({
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
          error instanceof Error
            ? error.message
            : "Anonymous take preview failed.",
      },
      { status: 400 },
    );
  }
}
