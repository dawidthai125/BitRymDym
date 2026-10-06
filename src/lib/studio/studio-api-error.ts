import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import {
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";

export function studioApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof StudioFxCasConflictError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 409 },
    );
  }
  if (error instanceof StudioFxChainError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 },
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
      error:
        error instanceof Error ? error.message : "Żądanie Studio nie powiodło się.",
    },
    { status: 400 },
  );
}
