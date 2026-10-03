/**
 * Email-confirmation + password-recovery UX helpers (pure).
 * Tokens/codes must never be logged or passed to the confirmed page.
 *
 * Cross-browser confirm uses token_hash + verifyOtp (not ConfirmationURL/PKCE).
 * Recovery supports:
 *   - OTP: token_hash + type=recovery
 *   - PKCE: code + flow=recovery (server redirectTo marker)
 */

export type ConfirmationStatus = "success" | "invalid" | "error";

/** Path pattern for Supabase Confirm signup template (SiteURL + this). */
export const CONFIRMATION_EMAIL_CALLBACK_PATH =
  "/auth/callback?token_hash={{ .TokenHash }}&type=signup";

/**
 * Path pattern for Supabase Recovery email template (OTP / TokenHash).
 * Prefer this over ConfirmationURL for cross-browser recovery.
 */
export const RECOVERY_EMAIL_CALLBACK_PATH =
  "/auth/callback?token_hash={{ .TokenHash }}&type=recovery";

/** Query marker on resetPasswordForEmail redirectTo (PKCE landing). */
export const RECOVERY_CALLBACK_FLOW = "recovery";

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
  | { kind: "otp"; tokenHash: string; type: string }
  | { kind: "pkce"; code: string; recovery: boolean }
  | { kind: "missing" };

/**
 * Classify callback query params without exposing secrets in return paths.
 * Prefer token_hash + type (OTP) over PKCE code.
 *
 * Recovery markers:
 * - OTP: type=recovery (+ token_hash)
 * - PKCE: flow=recovery on redirectTo (preferred) or type=recovery with code
 */
export function classifyAuthCallbackParams(input: {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  flow?: string | null;
}): AuthCallbackKind {
  const tokenHash = input.tokenHash?.trim() || null;
  const type = input.type?.trim() || null;
  const code = input.code?.trim() || null;
  const flow = input.flow?.trim() || null;

  if (tokenHash && type) {
    return { kind: "otp", tokenHash, type };
  }

  // PKCE code may carry recovery intent via flow= or type= (no token_hash).
  if (code && !tokenHash) {
    const recovery = flow === RECOVERY_CALLBACK_FLOW || type === "recovery";
    return { kind: "pkce", code, recovery };
  }

  // Incomplete OTP params (hash without type, or type without hash/code) → missing
  if (tokenHash || type || flow) {
    return { kind: "missing" };
  }

  return { kind: "missing" };
}

export function isRecoveryCallback(classified: AuthCallbackKind): boolean {
  if (classified.kind === "otp") return classified.type === "recovery";
  if (classified.kind === "pkce") return classified.recovery;
  return false;
}

/**
 * Pure post-exchange routing decision (testable without Next / Supabase I/O).
 */
export type AuthCallbackRouteDecision =
  | { kind: "reset_password"; signOut: false }
  | { kind: "forgot_password"; signOut: false }
  | {
      kind: "confirmed";
      status: ConfirmationStatus;
      signOut: boolean;
    };

export function decideAuthCallbackRoute(params: {
  classified: AuthCallbackKind;
  exchangeOk: boolean;
  exchangeErrorMessage?: string | null;
}): AuthCallbackRouteDecision {
  const { classified, exchangeOk } = params;
  const recovery = isRecoveryCallback(classified);

  if (classified.kind === "missing") {
    return { kind: "confirmed", status: "error", signOut: false };
  }

  if (!exchangeOk) {
    if (recovery) {
      return { kind: "forgot_password", signOut: false };
    }
    return {
      kind: "confirmed",
      status: confirmationStatusFromAuthError(params.exchangeErrorMessage),
      signOut: false,
    };
  }

  if (recovery) {
    return { kind: "reset_password", signOut: false };
  }

  // Signup / other confirms: end signed-out at confirmed success.
  return { kind: "confirmed", status: "success", signOut: true };
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
    m.includes("flow_state") ||
    m.includes("bad_code_verifier") ||
    m.includes("code challenge")
  ) {
    return "invalid";
  }
  return "error";
}

/** Post-confirm role defaults (OD-19) — confirmation never escalates privilege. */
export const POST_CONFIRMATION_IDENTITY = {
  role: "USER",
  accountLevel: "BEGINNER_RAPPER",
} as const;
