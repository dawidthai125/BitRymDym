import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { finalizeTakeRecording } from "@/lib/takes/take-transport";

export const runtime = "nodejs";

/**
 * Recording Wave 2 — finalize take after signed binary upload.
 * POST JSON { takeId }
 * Duration probe is fail-closed (OD-W2-04).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      durationSeconds?: number;
      objectKey?: string | null;
      ownerId?: string | null;
    };

    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    // Client duration / storage identity fields are ignored for AuthZ/READY.
    void body.durationSeconds;
    void body.objectKey;
    void body.ownerId;

    const result = await finalizeTakeRecording({ takeId: body.takeId });
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
          error instanceof Error ? error.message : "Take finalize failed.",
      },
      { status: 400 },
    );
  }
}
