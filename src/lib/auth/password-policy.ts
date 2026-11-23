/**
 * Shared password validation for signup / change / reset (pure).
 */

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads only the first 72 bytes; Supabase refuses longer passwords. */
export const PASSWORD_MAX_BYTES = 72;

/** The provider refuses passwords from public leaks (HaveIBeenPwned). */
export const PASSWORD_LEAKED_ERROR =
  "To hasło jest na liście haseł, które wyciekły z innych serwisów. Wpisz inne, na przykład kilka przypadkowych słów i cyfrę.";
export const PASSWORD_TOO_SIMPLE_ERROR =
  "Hasło jest za proste. Dodaj wielką literę, cyfrę i znak specjalny.";
export const PASSWORD_TOO_SHORT_ERROR = `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`;
export const PASSWORD_TOO_LONG_ERROR =
  "Hasło jest za długie. Skróć je do 72 znaków (polska litera liczy się jak dwa).";
export const PASSWORD_SAME_AS_OLD_ERROR =
  "Nowe hasło musi być inne niż obecne.";

export function passwordChecks(password: string, confirm: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    notTooLong: new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES,
    match: password.length > 0 && password === confirm,
  };
}

/** Supabase Auth message → what is wrong with the password, or null. */
export function mapPasswordProviderError(
  message: string | null | undefined,
): string | null {
  const lower = (message ?? "").toLowerCase();
  if (!lower.includes("password")) return null;
  if (lower.includes("different from the old")) return PASSWORD_SAME_AS_OLD_ERROR;
  if (lower.includes("known to be weak") || lower.includes("pwned")) {
    return PASSWORD_LEAKED_ERROR;
  }
  if (lower.includes("longer than")) return PASSWORD_TOO_LONG_ERROR;
  if (lower.includes("should contain") || lower.includes("weak")) {
    return PASSWORD_TOO_SIMPLE_ERROR;
  }
  if (/at least \d+ characters/.test(lower) || lower.includes("short")) {
    return PASSWORD_TOO_SHORT_ERROR;
  }
  return null;
}

export type PasswordValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateNewPassword(
  password: string,
  confirm: string,
): PasswordValidation {
  if (!password) {
    return { ok: false, error: "Nowe hasło jest wymagane." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: PASSWORD_TOO_SHORT_ERROR,
    };
  }
  if (!passwordChecks(password, confirm).notTooLong) {
    return { ok: false, error: PASSWORD_TOO_LONG_ERROR };
  }
  if (password !== confirm) {
    return { ok: false, error: "Hasła nie są takie same." };
  }
  return { ok: true };
}
