import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { TakeClaimError } from "@/lib/takes/claim-errors";

export function takeApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof TakeClaimError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : 403;
    return NextResponse.json(
      {
        error: error.message,
        code: error.claimCode,
        replaceableTakes: error.replaceableTakes ?? undefined,
      },
      { status },
    );
  }
  if (error instanceof AuthError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Take request failed.",
    },
    { status: 400 },
  );
}
