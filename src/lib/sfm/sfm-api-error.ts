/**
 * SFM HTTP error mapping — safe public codes, no SQL/RPC dump to clients.
 */

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { SfmDomainError, type SfmDomainErrorCode } from "@/lib/sfm/sfm-domain";

export function sfmHttpStatusForDomainCode(code: SfmDomainErrorCode): number {
  switch (code) {
    case "DISABLED":
      return 503;
    case "NOT_FOUND":
      return 404;
    case "VERSION_CONFLICT":
    case "CONFLICT":
    case "ILLEGAL_TRANSITION":
    case "RECOVERY_REQUIRED":
    case "LIMIT_EXCEEDED":
    case "NO_SLOT":
      return 409;
    case "INVALID":
    case "INVALID_SESSION":
    case "QC_FAILED":
      return 400;
    case "FORBIDDEN":
    case "NOT_OWNER":
    case "NOT_ELIGIBLE":
    case "NO_GRANT":
    case "QUALITY_DENIED":
    case "PLAN_DENIED":
    case "FREE_NO_DOWNLOAD":
    case "DOWNGRADE_NEW_QUALITY":
      return 403;
    default:
      return 403;
  }
}

/** Map AuthError / SfmDomainError; never echo raw unknown internals. */
export function sfmApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : 403;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  if (error instanceof SfmDomainError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: sfmHttpStatusForDomainCode(error.code) },
    );
  }
  return NextResponse.json(
    { error: "Żądanie Studio Final Mix nie powiodło się.", code: "INVALID" },
    { status: 400 },
  );
}
