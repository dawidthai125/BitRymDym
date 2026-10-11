/**
 * Stage I.17 — Studio Export public failure contract (variant B).
 * Allowlists job error_code for GET status; never echoes raw DB/renderer text.
 * MIX / TAKE_EXPORT taxonomies are unchanged.
 */

export const STUDIO_EXPORT_EMPTY_SESSION_CODE =
  "STUDIO_RENDER_EMPTY_SESSION" as const;

/** Codes safe to return on Studio Export status GET after allowlist check. */
export const STUDIO_EXPORT_PUBLIC_ERROR_CODES = new Set<string>([
  STUDIO_EXPORT_EMPTY_SESSION_CODE,
  "SOURCE_UNAVAILABLE",
  "LIMIT",
  "ENCODE_FAILED",
  "INVALID",
  "TIER_UNSUPPORTED",
  "UPLOAD_FAILED",
  "ENCODER_UNAVAILABLE",
  "TIMEOUT",
  "CANCELLED",
]);

const GENERIC_FAILED_MESSAGE =
  "Eksport nie powiódł się. Możesz spróbować ponownie.";

const EMPTY_SESSION_MESSAGE =
  "Nie można wyeksportować pustej lub całkowicie wyciszonej sesji. Włącz co najmniej jedno źródło dźwięku i spróbuj ponownie.";

/**
 * Stable Polish copy for allowlisted codes. Never pass through DB/renderer strings.
 */
export function studioExportPublicErrorMessage(errorCode: string | null): string {
  switch (errorCode) {
    case STUDIO_EXPORT_EMPTY_SESSION_CODE:
      return EMPTY_SESSION_MESSAGE;
    case "SOURCE_UNAVAILABLE":
      return "Nie udało się odczytać źródeł audio. Sprawdź dostępność take/beat i spróbuj ponownie.";
    case "LIMIT":
      return "Eksport przekroczył limit czasu lub pamięci. Skróć sesję albo uprość efekty i spróbuj ponownie.";
    case "TIER_UNSUPPORTED":
      return "Wybrany format eksportu nie jest obsługiwany.";
    case "UPLOAD_FAILED":
      return "Eksport nie powiódł się podczas zapisu pliku. Spróbuj ponownie.";
    case "ENCODER_UNAVAILABLE":
      return "Eksport jest obecnie niedostępny.";
    case "TIMEOUT":
      return "Eksport przekroczył limit czasu. Spróbuj ponownie.";
    case "CANCELLED":
      return "Eksport został anulowany.";
    case "INVALID":
    case "ENCODE_FAILED":
    default:
      return GENERIC_FAILED_MESSAGE;
  }
}

export function isStudioExportPublicErrorCode(
  code: string | null | undefined,
): boolean {
  return typeof code === "string" && STUDIO_EXPORT_PUBLIC_ERROR_CODES.has(code);
}

/**
 * Map raw render_jobs.error_code → public fields for Studio Export status API.
 * Ignores raw error_message from DB (may contain internal wording).
 */
export function publicStudioExportFailure(params: {
  status: string;
  rawErrorCode: string | null | undefined;
}): { errorCode: string | null; errorMessage: string | null } {
  const terminalFail =
    params.status === "FAILED" ||
    params.status === "CANCELLED" ||
    params.status === "TIMEOUT";
  if (!terminalFail) {
    return { errorCode: null, errorMessage: null };
  }
  const raw =
    typeof params.rawErrorCode === "string" && params.rawErrorCode.length > 0
      ? params.rawErrorCode
      : null;
  const errorCode = isStudioExportPublicErrorCode(raw)
    ? raw
    : "ENCODE_FAILED";
  return {
    errorCode,
    errorMessage: studioExportPublicErrorMessage(errorCode),
  };
}
