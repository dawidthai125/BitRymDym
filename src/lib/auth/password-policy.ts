/**
 * Shared password validation for signup / change / reset (pure).
 */

export const PASSWORD_MIN_LENGTH = 8;

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
      error: `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`,
    };
  }
  if (password !== confirm) {
    return { ok: false, error: "Hasła nie są takie same." };
  }
  return { ok: true };
}
