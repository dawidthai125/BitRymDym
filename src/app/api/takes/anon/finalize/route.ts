import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { finalizeAnonTakeRecording } from "@/lib/takes/anon-take-transport";

export const runtime = "nodejs";

/**
 * D02 anonymous take finalize after signed binary upload.
 * Hash ↔ take.anonymous_token_hash; takeId alone is not authority.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      durationSeconds?: number;
      objectKey?: string | null;
      ownerId?: string | null;
      anonymous?: boolean;
    };

    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    void body.durationSeconds;
    void body.objectKey;
    void body.ownerId;
    void body.anonymous;

    const result = await finalizeAnonTakeRecording({ takeId: body.takeId });
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
            : "Anonymous take finalize failed.",
      },
      { status: 400 },
    );
  }
}
