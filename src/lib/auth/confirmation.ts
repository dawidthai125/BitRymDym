/**
 * Email-confirmation UX helpers (pure).
 * Tokens/codes must never be logged or passed to the confirmed page.
 */

export type ConfirmationStatus = "success" | "invalid" | "error";

export const CONFIRMATION_COPY = {
  success: {
    title: "Konto zostało aktywowane!",
    body: "Twój adres e-mail został potwierdzony. Możesz teraz zalogować się do BitRymDym.",
  },
  invalid: {
    title: "Nie udało się potwierdzić konta",
    body: "Link potwierdzający jest nieprawidłowy lub wygasł. Poproś o nową wiadomość z potwierdzeniem.",
  },
  error: {
    title: "Nie udało się potwierdzić konta",
    body: "Wystąpił problem podczas potwierdzania adresu e-mail. Spróbuj ponownie lub zaloguj się, jeśli konto jest już aktywne.",
  },
} as const;

export type AuthCallbackKind =
  | { kind: "pkce"; code: string }
  | { kind: "otp"; tokenHash: string; type: string }
  | { kind: "missing" };

/**
 * Classify callback query params without exposing secrets in return paths.
 */
export function classifyAuthCallbackParams(input: {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
}): AuthCallbackKind {
  const code = input.code?.trim() || null;
  if (code) {
    return { kind: "pkce", code };
  }

  const tokenHash = input.tokenHash?.trim() || null;
  const type = input.type?.trim() || null;
  if (tokenHash && type) {
    return { kind: "otp", tokenHash, type };
  }

  return { kind: "missing" };
}

export function parseConfirmationStatus(
  raw: string | null | undefined,
): ConfirmationStatus {
  if (raw === "success" || raw === "invalid" || raw === "error") {
    return raw;
  }
  return "error";
}

export function confirmationResultPath(status: ConfirmationStatus): string {
  return `/auth/confirmed?status=${status}`;
}

/**
 * Map Auth errors to safe UX status — never surface raw Supabase messages.
 */
export function confirmationStatusFromAuthError(
  message: string | undefined | null,
): Exclude<ConfirmationStatus, "success"> {
  const m = (message ?? "").toLowerCase();
  if (
    m.includes("expired") ||
    m.includes("invalid") ||
    m.includes("otp_expired") ||
    m.includes("token has expired") ||
    m.includes("token not found") ||
    m.includes("flow_state")
  ) {
    return "invalid";
  }
  return "error";
}
