import "server-only";

import { NextResponse } from "next/server";

import { authErrorHttpStatus } from "@/lib/auth/auth-error-http";
import { AuthError } from "@/lib/auth/session";
import {
  BeatRequestError,
  type BeatRequestErrorCode,
} from "@/lib/beats/request-error";

export const BEAT_AUDIO_INTERNAL_ERROR =
  "Operacja audio nie powiodła się. Spróbuj ponownie.";

export const BEAT_ACTION_INTERNAL_ERROR =
  "Operacja nie powiodła się. Spróbuj ponownie.";

export type BeatOperationError = {
  status: number;
  code: AuthError["code"] | BeatRequestErrorCode | "INTERNAL";
  message: string;
};

/**
 * Error contract for beat API routes and server actions. `AuthError` and
 * `BeatRequestError` carry authored messages and are returned as-is; anything
 * else (database, storage, unexpected) is logged under `tag` and replaced by
 * `internalMessage`, so infrastructure text never reaches the client.
 */
export function classifyBeatOperationError(
  error: unknown,
  tag: string,
  internalMessage: string,
): BeatOperationError {
  if (error instanceof AuthError) {
    return {
      status: authErrorHttpStatus(error),
      code: error.code,
      message: error.message,
    };
  }
  if (error instanceof BeatRequestError) {
    return {
      status: error.code === "CONFLICT" ? 409 : 400,
      code: error.code,
      message: error.message,
    };
  }
  console.error(`[${tag}] unexpected error`, error);
  return { status: 500, code: "INTERNAL", message: internalMessage };
}

/** 400 for malformed input rejected by a route before any service call. */
export function beatApiBadRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, code: "INVALID" }, { status: 400 });
}

/** JSON error response for beat API routes (audio, grants). */
export function beatApiErrorResponse(
  error: unknown,
  route: string,
  internalMessage: string = BEAT_ACTION_INTERNAL_ERROR,
): NextResponse {
  const classified = classifyBeatOperationError(error, route, internalMessage);
  return NextResponse.json(
    { error: classified.message, code: classified.code },
    { status: classified.status },
  );
}

/** `/api/admin/beats/**` and `/api/beats/audio/**`. */
export function beatAudioApiErrorResponse(
  error: unknown,
  route: string,
): NextResponse {
  return beatApiErrorResponse(error, route, BEAT_AUDIO_INTERNAL_ERROR);
}

/** User-visible message for beat server actions (`{ error, success: false }`). */
export function beatActionErrorMessage(error: unknown, action: string): string {
  return classifyBeatOperationError(error, action, BEAT_ACTION_INTERNAL_ERROR)
    .message;
}
