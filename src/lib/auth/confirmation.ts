/**
 * Email-confirmation + password-recovery UX helpers (pure).
 * Tokens/codes must never be logged or passed to the confirmed page.
 *
 * Cross-browser confirm uses token_hash + verifyOtp (not ConfirmationURL/PKCE).
 * Recovery supports:
 *   - OTP: token_hash + type=recovery
 *   - PKCE: code + flow=recovery (server redirectTo marker)
 */

import { SIGN_IN_NEXT_PARAM, safeNextPath } from "@/lib/auth/next-path";

export type ConfirmationStatus = "success" | "invalid" | "error";

/** Where a freshly confirmed account lands when no `next` survived (Studio shows "Pierwsze kroki"). */
export const SIGNUP_CONFIRMED_DEFAULT_PATH = "/studio";

/**
 * user_metadata key holding the sign-up return path. The Confirm signup template links
 * `{{ .SiteURL }}/auth/callback?token_hash=…&type=signup` (no RedirectTo), so the query
 * `next` on emailRedirectTo never reaches the callback — metadata does, on any device.
 * User-writable: always re-validated with safeNextPath on read.
 */
export const SIGNUP_NEXT_METADATA_KEY = "signup_next";

/**
 * Browser binding for "stay signed in after confirming" (login-CSRF guard).
 * signUpAction sets this HttpOnly cookie to the new user id; the callback keeps the
 * session only when the confirming browser carries the id of the user it just verified.
 * Someone else's confirmation link (or one opened on another device) → old behaviour:
 * sign out → /auth/confirmed (with next). An attacker cannot plant this cookie for our origin.
 */
export const SIGNUP_BROWSER_COOKIE = "brd_signup_browser";
/** Covers the confirmation link lifetime (Supabase default 24h) with margin. */
export const SIGNUP_BROWSER_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function signupBrowserCookieOptions(secure: boolean, maxAge = SIGNUP_BROWSER_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/auth/callback",
    maxAge,
  };
}

export function signupBrowserMatches(
  cookieValue: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  return Boolean(cookieValue && userId && cookieValue === userId);
}

/** OTP types that confirm a new account's e-mail (GoTrue: `signup`, newer `email`). */
const SIGNUP_CONFIRM_OTP_TYPES = new Set(["signup", "email"]);

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

/** Query marker on updateUser email redirectTo (PKCE landing). */
export const EMAIL_CHANGE_CALLBACK_FLOW = "email_change";

/** GoTrue OTP type for an email-change confirmation link. */
export const EMAIL_CHANGE_OTP_TYPE = "email_change";

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
  | { kind: "pkce"; code: string; recovery: boolean; emailChange?: boolean }
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

  // PKCE code may carry recovery or email-change intent (no token_hash).
  if (code && !tokenHash) {
    const recovery = flow === RECOVERY_CALLBACK_FLOW || type === "recovery";
    const emailChange =
      !recovery &&
      (flow === EMAIL_CHANGE_CALLBACK_FLOW || type === EMAIL_CHANGE_OTP_TYPE);
    return { kind: "pkce", code, recovery, emailChange };
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

export function isEmailChangeCallback(classified: AuthCallbackKind): boolean {
  if (classified.kind === "otp") return classified.type === EMAIL_CHANGE_OTP_TYPE;
  if (classified.kind === "pkce") return classified.emailChange === true;
  return false;
}

/** Sign-up e-mail confirmation (OTP signup/email, or a PKCE code that is neither recovery nor email change). */
export function isSignupConfirmationCallback(classified: AuthCallbackKind): boolean {
  if (classified.kind === "otp") return SIGNUP_CONFIRM_OTP_TYPES.has(classified.type);
  if (classified.kind === "pkce") return !classified.recovery && classified.emailChange !== true;
  return false;
}

/**
 * Return path after a sign-up confirmation: callback query `next` (emailRedirectTo /
 * a RedirectTo-based template) wins, then the path stored at sign-up in user_metadata.
 * Both are untrusted input → safeNextPath (same-origin relative path only).
 */
export function resolveSignupNextPath(input: {
  queryNext: unknown;
  userMetadata?: Record<string, unknown> | null;
}): string | null {
  return (
    safeNextPath(input.queryNext) ??
    safeNextPath(input.userMetadata?.[SIGNUP_NEXT_METADATA_KEY])
  );
}

/**
 * Pure post-exchange routing decision (testable without Next / Supabase I/O).
 */
export type AuthCallbackRouteDecision =
  | { kind: "reset_password"; signOut: false }
  | { kind: "forgot_password"; signOut: false }
  | { kind: "email_change"; signOut: false }
  | { kind: "email_change_failed"; signOut: false }
  /** Sign-up confirmed: keep the new session and go back to `next` (else Studio). */
  | { kind: "signed_in"; signOut: false }
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

  if (isEmailChangeCallback(classified)) {
    if (!exchangeOk) {
      return { kind: "email_change_failed", signOut: false };
    }
    return { kind: "email_change", signOut: false };
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

  // Owner decision: a confirmed sign-up stays signed in and returns where it started.
  if (isSignupConfirmationCallback(classified)) {
    return { kind: "signed_in", signOut: false };
  }

  // Other confirms (magic link / invite — not sent by the product): end signed-out.
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

export function confirmationResultPath(
  status: ConfirmationStatus,
  next?: string | null,
): string {
  const safe = safeNextPath(next);
  const base = `/auth/confirmed?status=${status}`;
  return safe ? `${base}&${SIGN_IN_NEXT_PARAM}=${encodeURIComponent(safe)}` : base;
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
