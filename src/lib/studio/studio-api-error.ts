import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";

export function studioApiErrorResponse(error: unknown): NextResponse {
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
      error:
        error instanceof Error ? error.message : "Żądanie Studio nie powiodło się.",
    },
    { status: 400 },
  );
}
