/**
 * Pure interpretation of Supabase auth.signUp() result for UX.
 * Anti-enumeration: no-session paths share one neutral message.
 */

export const SIGNUP_PENDING_NEUTRAL_MESSAGE =
  "Sprawdź swoją skrzynkę e-mail i potwierdź konto. Jeśli konto z tym adresem już istnieje, zaloguj się lub skorzystaj z opcji resetowania hasła.";

export type SignUpInterpretation =
  | { kind: "error"; error: string }
  | { kind: "session" }
  | { kind: "pending_confirmation"; message: string };

/**
 * Map signUp() payload to app UX outcome.
 * Does not reveal whether the email is already registered.
 */
export function interpretSignUpResult(input: {
  error: { message: string } | null;
  session: unknown | null | undefined;
  /** Present for observability in tests; not used to change user-facing copy. */
  identities?: unknown[] | null;
}): SignUpInterpretation {
  if (input.error) {
    return { kind: "error", error: input.error.message };
  }

  if (input.session) {
    return { kind: "session" };
  }

  // Confirmation required OR obfuscated duplicate confirmed user (identities=[]).
  // Same copy for both — anti-enumeration.
  return {
    kind: "pending_confirmation",
    message: SIGNUP_PENDING_NEUTRAL_MESSAGE,
  };
}
