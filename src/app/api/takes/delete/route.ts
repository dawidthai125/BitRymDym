import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { softDeleteOwnTake } from "@/lib/takes/take-delete";

export const runtime = "nodejs";

/**
 * Recording Wave 4 — owner soft-delete.
 * POST JSON { takeId }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { takeId?: string };
    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    const result = await softDeleteOwnTake({ takeId: body.takeId });
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
        error: error instanceof Error ? error.message : "Take delete failed.",
      },
      { status: 400 },
    );
  }
}
