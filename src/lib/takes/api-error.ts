import { NextResponse } from "next/server";

import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { AuthError } from "@/lib/auth/session";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import { TakeTitleError, type TakeTitleErrorCode } from "@/lib/takes/take-title";
import { RightsStatementRequiredError, UploadBlockedError } from "@/lib/rights/upload-screen-policy";

export function takeApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof RightsStatementRequiredError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof UploadBlockedError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "SCREENING_PENDING" ? 409 : 403 });
  }
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
  if (error instanceof AudioEntitlementError) {
    return NextResponse.json(
      { error: "Ten plik nie jest w Twoim planie.", code: "PLAN" },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
    );
  }
  if (error instanceof TakeTitleError) {
    return NextResponse.json(
      { error: TAKE_TITLE_ERROR_MESSAGE[error.code], code: error.code },
      { status: 400 },
    );
  }
  // A body that is not JSON is the caller's mistake, not ours.
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Nieprawidłowe żądanie.", code: "VALIDATION" }, { status: 400 });
  }
  // Same rule as studioApiErrorResponse: known input checks → 400, the rest is logged and answered generically.
  const invalid = takeValidationMessage(error);
  if (invalid) {
    return NextResponse.json({ error: invalid, code: "VALIDATION" }, { status: 400 });
  }
  console.error("[takes-api] unexpected error", error);
  return NextResponse.json(
    { error: TAKE_INTERNAL_ERROR, code: "INTERNAL" },
    { status: 500 },
  );
}

/** Polish copy per title rule (EN via messages/lib-text.json). */
export const TAKE_TITLE_ERROR_MESSAGE: Record<TakeTitleErrorCode, string> = {
  TITLE_NOT_STRING: "Tytuł jest za długi albo nieprawidłowy.",
  TITLE_RESERVED_PREFIX: "Tytuł nie może zaczynać się od „smp:” ani „catalog:”.",
  TITLE_TOO_LONG: "Tytuł może mieć najwyżej 120 znaków.",
};

/** The only text a client sees for an unknown server error. */
export const TAKE_INTERNAL_ERROR = "Coś poszło nie tak na serwerze. Spróbuj ponownie za chwilę.";

function takeValidationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (/^Title must be /.test(error.message)) return "Tytuł jest za długi albo nieprawidłowy.";
  if (/^Invalid beat duration\.$/.test(error.message)) return "Ten bit nie ma poprawnej długości.";
  if (/ must be a uuid$/.test(error.message)) return "Nieprawidłowy identyfikator.";
  return null;
}
